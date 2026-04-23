export interface AuthUser {
  id: string | number;
  username: string;
  name?: string;
  role: 'student' | 'teacher' | 'admin';
  avatar?: string;
  storeName?: string;
  onlineStatus?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

type ApiErrorPayload = {
  error?: string;
  code?: string;
};

function throwApiError(payload: ApiErrorPayload | null | undefined, fallbackMessage: string): never {
  const err = new Error(payload?.error || fallbackMessage) as Error & { code?: string };
  if (payload?.code) {
    err.code = payload.code;
  }
  throw err;
}

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  loginPassword?: string;
  avatar?: string;
  phone?: string;
  textbookVersion?: string;
  grade?: string;
  storeName?: string;
  expireDate?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminStore {
  id?: number;
  storeCode: string;
  storeName: string;
  teacherMax: number;
  studentMax: number;
  textbookPermissions: string[];
  gradePermissions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UnitTaskItem {
  textbookVersion: string;
  grade: string;
  semester: string;
  unitName: string;
}

export interface UnitAssignment {
  id: number;
  userId: number;
  assignedBy: number;
  textbookVersion: string;
  grade: string;
  semester: string;
  unitName: string;
  status: string;
  paperId?: number | null;
  paperTitle?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeacherExamSectionConfigRequest {
  sectionTitle?: string;
  questionType: string;
  count: number;
}

export interface TeacherExamPaperGenerateRequest {
  createdBy: number;
  storeCode?: string;
  title?: string;
  bookVersion?: string;
  grade?: string;
  semester?: string;
  unitCode?: string;
  difficulty?: string;
  knowledgeTag?: string;
  sections: TeacherExamSectionConfigRequest[];
}

export interface TeacherExamPaperListItem {
  id: number;
  paperCode: string;
  title: string;
  createdBy: number;
  storeCode?: string;
  bookVersion?: string;
  grade?: string;
  semester?: string;
  unitCode?: string;
  difficulty?: string;
  knowledgeTags?: any;
  status: string;
  totalSectionCount: number;
  totalQuestionCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeacherExamPaperSectionItem {
  id: number;
  sortOrder: number;
  itemType: 'question' | 'group';
  questionId?: number | null;
  groupId?: number | null;
  snapshot: any;
}

export interface TeacherExamPaperSection {
  id: number;
  sectionNo: number;
  sectionTitle: string;
  questionType: string;
  requestedCount: number;
  actualCount: number;
  itemType: 'question' | 'group';
  items: TeacherExamPaperSectionItem[];
}

export interface TeacherExamPaperDetail {
  id: number;
  paperCode: string;
  title: string;
  createdBy: number;
  storeCode?: string;
  bookVersion?: string;
  grade?: string;
  semester?: string;
  unitCode?: string;
  difficulty?: string;
  knowledgeTags?: any;
  status: string;
  totalSectionCount: number;
  totalQuestionCount: number;
  createdAt?: string;
  updatedAt?: string;
  sections: TeacherExamPaperSection[];
}

export interface TeacherExamQuestionCandidate {
  itemType: 'question' | 'group';
  questionId?: number | null;
  groupId?: number | null;
  questionType: string;
  label?: string;
  stem?: string;
  sharedStem?: string;
  material?: string;
  questionCount?: number;
  bookVersion?: string;
  grade?: string;
  semester?: string;
  unitCode?: string;
  sourceFile?: string;
}

export interface StudentTeacherExamResultItem {
  sectionId: number;
  sectionTitle: string;
  sectionQuestionType: string;
  sectionItemId: number;
  itemType: 'question' | 'group';
  questionId?: number | null;
  questionUid?: string;
  questionNo?: number | null;
  questionType: string;
  submittedAnswer: any;
  correctAnswer: any;
  correct: boolean;
  sourceFile?: string;
  sharedStem?: string;
  material?: string;
  stem?: string;
  options?: any;
  analysis?: string;
}

export interface StudentTeacherExamSubmissionResult {
  submissionId: number;
  assignmentId: number;
  paperId: number;
  userId: number;
  paperTitle: string;
  bookVersion?: string;
  grade?: string;
  semester?: string;
  unitCode?: string;
  score: number;
  correctCount: number;
  totalCount: number;
  durationSeconds?: number | null;
  answers: any;
  submittedAt?: string;
  resultItems: StudentTeacherExamResultItem[];
}

export interface StudentTeacherExamAssignment {
  assignmentId: number;
  userId: number;
  textbookVersion: string;
  grade: string;
  semester: string;
  unitName: string;
  paperId: number;
  paperTitle?: string;
  paper: TeacherExamPaperDetail;
  latestSubmission?: StudentTeacherExamSubmissionResult | null;
}

export interface StudentTeacherExamWrongNotebookItem {
  id: number;
  assignmentId: number;
  paperId: number;
  paperTitle: string;
  bookVersion?: string;
  grade?: string;
  semester?: string;
  unitCode?: string;
  sectionId?: number | null;
  sectionTitle?: string;
  sectionQuestionType?: string;
  sectionItemId?: number | null;
  questionId?: number | null;
  questionUid?: string;
  questionNo?: number | null;
  questionType?: string;
  sourceFile?: string;
  sourceLabel?: string;
  sharedStem?: string;
  material?: string;
  stem?: string;
  options?: any;
  submittedAnswer?: any;
  correctAnswer?: any;
  analysis?: string;
  wrongCount: number;
  lastWrongAt?: string;
}

export interface StudentTeacherExamWrongNotebookGroup {
  sourceKey: string;
  sourceLabel: string;
  items: StudentTeacherExamWrongNotebookItem[];
}

export interface LearningSessionState {
  id?: number;
  userId: number;
  unitId: string;
  module: 'vocab' | 'phrase' | 'reading';
  stateJson: string;
  updatedAt?: string;
}

export interface LearningGroupProgress {
  id?: number;
  userId: number;
  unitId: string;
  module: 'vocab' | 'phrase' | 'reading';
  groupNo: number;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  itemTotal?: number;
  learnedCount?: number;
  updatedAt?: string;
}

export interface StudentCheckInCalendarData {
  year: number;
  month: number;
  checkedInDates: number[];
  todayCheckedIn: boolean;
  streakDays: number;
  success?: boolean;
  message?: string;
}

export interface StudentLearningStats {
  userId: number;
  statsDate: string;
  totalWordsCompleted: number;
  todayWordsCompleted: number;
  totalPhrasesCompleted: number;
  todayPhrasesCompleted: number;
  totalPassagesCompleted: number;
  todayPassagesCompleted: number;
  totalReviewWordsCompleted: number;
  todayReviewWordsCompleted: number;
}

export interface WordTestGroupScope {
  textbookVersion: string;
  grade: string;
  semester: string;
  unit: string;
  sourceTag?: string;
  groupNo: number;
}

export interface WordTestContentItem {
  entryId: string;
  sourceTag?: string;
  word: string;
  phonetic?: string;
  meaning?: string;
  pos?: string;
  wordAudio?: string;
}

export interface StudentWordTestAssignment {
  assignmentId: number;
  testId: string;
  title: string;
  testType: string;
  status: 'pending' | 'completed';
  passScore?: number | null;
  attemptCount?: number | null;
  score?: number | null;
  correctCount?: number | null;
  totalCount?: number | null;
  duration?: number | null;
  createdAt?: string;
  completedAt?: string;
  items: WordTestContentItem[];
}

export interface PublishWordTestRequest {
  createdBy: number;
  storeCode: string;
  title: string;
  testType: string;
  passScore?: number;
  studentIds: number[];
  scopes: WordTestGroupScope[];
  items: WordTestContentItem[];
}
export interface WordTestAssignmentRow {
  assignmentId: number;
  testId: string;
  userId: number;
  title: string;
  testType: string;
  status: string;
  passScore?: number | null;
  attemptCount?: number | null;
  score?: number | null;
  correctCount?: number | null;
  totalCount?: number | null;
  duration?: number | null;
  storeCode: string;
  createdAt?: string;
}

export interface WordReviewUnitScope {
  textbookVersion: string;
  grade: string;
  semester: string;
  unit: string;
  sourceTag?: string;
}

export interface WordReviewContentItem {
  entryId: string;
  sourceTag?: string;
  word: string;
  phonetic?: string;
  meaning?: string;
  pos?: string;
  wordAudio?: string;
  sentence?: string;
  sentenceCn?: string;
  sentenceAudio?: string;
}

export interface PublishWordReviewRequest {
  createdBy: number;
  storeCode: string;
  title: string;
  dailyQuota: number;
  enableSpelling: boolean;
  enableZhToEn: boolean;
  studentIds: number[];
  scopes: WordReviewUnitScope[];
  items: WordReviewContentItem[];
}

export interface WordReviewAssignmentRow {
  assignmentId: number;
  taskId: string;
  userId: number;
  title: string;
  status: 'pending' | 'completed';
  dailyQuota: number;
  enableSpelling: boolean;
  enableZhToEn: boolean;
  totalWordCount: number;
  masteredWordCount: number;
  lastReviewDate?: string | null;
  storeCode: string;
  createdAt?: string;
}

export interface StudentWordReviewAssignment {
  assignmentId: number;
  taskId: string;
  title: string;
  status: 'pending' | 'completed';
  dailyQuota: number;
  enableSpelling: boolean;
  enableZhToEn: boolean;
  totalWordCount: number;
  masteredWordCount: number;
  lastReviewDate?: string | null;
  todayDone?: boolean;
  createdAt?: string;
  completedAt?: string | null;
}

export interface WordReviewSessionItem {
  entryId: string;
  word: string;
  phonetic?: string;
  meaning?: string;
  wordAudio?: string;
  sentence?: string;
  sentenceCn?: string;
  sentenceAudio?: string;
}

export interface WordReviewDailySession {
  sessionId: number;
  assignmentId: number;
  taskTitle: string;
  dailyQuota: number;
  enableSpelling: boolean;
  enableZhToEn: boolean;
  totalWordCount: number;
  masteredWordCount: number;
  status: 'in_progress' | 'done';
  items: WordReviewSessionItem[];
}

export interface QuestionBankOptionItem {
  id?: number;
  key: string;
  text: string;
  sortOrder?: number;
}

export interface QuestionBankImportResult {
  batchId: number;
  batchCode: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}

export interface QuestionBankImportBatch {
  id: number;
  batchCode: string;
  sourceType: string;
  sourceFile?: string;
  parserVersion?: string;
  bookVersion: string;
  grade: string;
  semester: string;
  unitCode?: string;
  importStatus: string;
  overwriteMode: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  createdBy?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuestionBankQuestionSummary {
  id: number;
  questionUid: string;
  questionType: string;
  stem?: string;
  bookVersion: string;
  grade: string;
  semester: string;
  unitCode?: string;
  examScene?: string;
  groupId?: number | null;
  status?: string;
  sourceFile?: string;
  updatedAt?: string;
}

export interface QuestionBankQuestionDetail {
  id: number;
  questionUid: string;
  batchId: number;
  groupId?: number | null;
  groupUid?: string;
  questionType: string;
  questionNo?: number | null;
  stem?: string;
  answer: any;
  answerJson?: string;
  analysis?: string;
  difficulty?: string;
  knowledgeTags?: any;
  knowledgeTagsJson?: string;
  sourceType: string;
  sourceFile?: string;
  parserVersion?: string;
  bookVersion: string;
  grade: string;
  semester: string;
  unitCode?: string;
  examScene?: string;
  status?: string;
  remarks?: string;
  sharedStem?: string;
  material?: string;
  createdBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
  options: QuestionBankOptionItem[];
}

export interface QuestionBankQuestionUpdateRequest {
  stem?: string;
  answer?: any;
  analysis?: string;
  difficulty?: string;
  knowledgeTags?: any;
  bookVersion?: string;
  grade?: string;
  semester?: string;
  unitCode?: string;
  examScene?: string;
  status?: string;
  remarks?: string;
  sharedStem?: string;
  material?: string;
  options?: QuestionBankOptionItem[];
}

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const authApi = {
  login: async (username: string, password: string): Promise<{ user: AuthUser; token: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throwApiError(payload, '登录失败');
    }

    return payload;
  },

  getCurrentUser: async (token: string): Promise<AuthUser> => {
    const response = await fetch(`${API_BASE_URL}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throwApiError(payload, '获取用户信息失败');
    }

    return payload;
  },

  logout: async (token: string): Promise<void> => {
    if (!token) return;
    const response = await fetch(`${API_BASE_URL}/api/users/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      let payload: ApiErrorPayload | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throwApiError(payload, '退出登录失败');
    }
  },

  getOnlineCount: async (token: string, role: 'student' | 'teacher' = 'student'): Promise<number> => {
    const response = await fetch(`${API_BASE_URL}/api/users/online/count?role=${encodeURIComponent(role)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '鑾峰彇鍦ㄧ嚎浜烘暟澶辫触');
    }
    return Number(payload?.count || 0);
  },
};

export const adminUserApi = {
  getAllUsers: async (token: string): Promise<AdminUser[]> => {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '鑾峰彇鐢ㄦ埛鍒楄〃澶辫触');
    }
    return payload;
  },

  updateUser: async (
    token: string,
    userId: number,
    data: Partial<Pick<AdminUser, 'username' | 'name' | 'role' | 'loginPassword' | 'avatar' | 'phone' | 'textbookVersion' | 'grade' | 'storeName' | 'expireDate' | 'active'>>
  ): Promise<AdminUser> => {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '鏇存柊鐢ㄦ埛澶辫触');
    }
    return payload;
  },

  createUser: async (
    token: string,
    data: Pick<AdminUser, 'username' | 'name' | 'role' | 'loginPassword' | 'active'> &
      Partial<Pick<AdminUser, 'avatar' | 'phone' | 'textbookVersion' | 'grade' | 'storeName' | 'expireDate'>>
  ): Promise<AdminUser> => {
    const response = await fetch(`${API_BASE_URL}/api/users/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '鍒涘缓鐢ㄦ埛澶辫触');
    }
    return payload;
  },

  deleteUser: async (token: string, userId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error('鍒犻櫎鐢ㄦ埛澶辫触');
    }
  },
};

export const teacherStudentApi = {
  getStoreStudents: async (token: string): Promise<AdminUser[]> => {
    const response = await fetch(`${API_BASE_URL}/api/users/teacher/students`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load students');
    }
    return payload;
  },

  createStudent: async (
    token: string,
    data: Pick<AdminUser, 'username' | 'name' | 'loginPassword' | 'textbookVersion' | 'grade' | 'active'> &
      Partial<Pick<AdminUser, 'phone' | 'expireDate'>>
  ): Promise<AdminUser> => {
    const response = await fetch(`${API_BASE_URL}/api/users/teacher/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...data,
        role: 'student',
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to create student');
    }
    return payload;
  },

  updateStudent: async (
    token: string,
    userId: number,
    data: Partial<Pick<AdminUser, 'username' | 'phone' | 'name' | 'loginPassword' | 'textbookVersion' | 'grade' | 'expireDate' | 'active'>>
  ): Promise<AdminUser> => {
    const response = await fetch(`${API_BASE_URL}/api/users/teacher/students/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...data,
        role: 'student',
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update student');
    }
    return payload;
  },

  deleteStudent: async (token: string, userId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/users/teacher/students/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      throw new Error(payload?.error || 'Failed to delete student');
    }
  },

  batchDeleteStudents: async (token: string, userIds: number[]): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/users/teacher/students/batch-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userIds }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to batch delete students');
    }
    return payload;
  },
};

export const adminStoreApi = {
  getAllStores: async (token: string): Promise<AdminStore[]> => {
    const response = await fetch(`${API_BASE_URL}/api/stores`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load stores');
    }
    return payload;
  },

  createStore: async (
    token: string,
    data: Pick<AdminStore, 'storeName' | 'teacherMax' | 'studentMax' | 'textbookPermissions'>
  ): Promise<AdminStore> => {
    const response = await fetch(`${API_BASE_URL}/api/stores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to create store');
    }
    return payload;
  },

  updateStore: async (
    token: string,
    storeCode: string,
    data: Partial<Pick<AdminStore, 'storeName' | 'teacherMax' | 'studentMax' | 'textbookPermissions'>>
  ): Promise<AdminStore> => {
    const response = await fetch(`${API_BASE_URL}/api/stores/${encodeURIComponent(storeCode)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update store');
    }
    return payload;
  },
};

export const accountMetaApi = {
  getLexiconOptions: async (token: string): Promise<{ bookVersions: string[]; grades: string[] }> => {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/options?type=word`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load lexicon options');
    }
    const bookVersions = (Array.isArray(payload?.bookVersions) ? payload.bookVersions : [])
      .map((v: unknown) => (v == null ? '' : String(v).trim()))
      .filter((v: string) => v.length > 0);
    const grades = (Array.isArray(payload?.grades) ? payload.grades : [])
      .map((v: unknown) => (v == null ? '' : String(v).trim()))
      .filter((v: string) => v.length > 0);
    return { bookVersions, grades };
  },

  getTextbookVersions: async (token: string): Promise<string[]> => {
    const options = await accountMetaApi.getLexiconOptions(token);
    return options.bookVersions;
  },
};

export const unitAssignmentApi = {
  getByStudent: async (token: string, userId: number): Promise<UnitAssignment[]> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/unit-assignments/student/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load unit assignments');
    }
    return payload;
  },

  getByStudents: async (token: string, userIds: number[]): Promise<UnitAssignment[]> => {
    const query = encodeURIComponent(userIds.join(','));
    const response = await fetch(`${API_BASE_URL}/api/tests/unit-assignments?userIds=${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load unit assignments');
    }
    return payload;
  },

  batchAssign: async (
    token: string,
    request: { assignedBy: number; studentIds: number[]; units: UnitTaskItem[]; paperId?: number; paperTitle?: string }
  ): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/unit-assignments/batch-assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to assign unit tasks');
    }
    return payload;
  },

  deleteOne: async (token: string, assignmentId: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/unit-assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to delete unit assignment');
    }
    return payload;
  },

  batchDelete: async (token: string, assignmentIds: number[]): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/unit-assignments/batch-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assignmentIds }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to delete unit assignments');
    }
    return payload;
  },
};

export const teacherExamPaperApi = {
  generate: async (token: string, request: TeacherExamPaperGenerateRequest): Promise<TeacherExamPaperDetail> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to generate teacher exam paper');
    return payload;
  },

  list: async (token: string, createdBy: number, storeCode?: string): Promise<TeacherExamPaperListItem[]> => {
    const q = new URLSearchParams({ createdBy: String(createdBy) });
    if (storeCode) q.set('storeCode', storeCode);
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load teacher exam papers');
    return payload;
  },

  getDetail: async (token: string, paperId: number): Promise<TeacherExamPaperDetail> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers/${paperId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load teacher exam paper detail');
    return payload;
  },

  update: async (token: string, paperId: number, body: { title?: string }): Promise<TeacherExamPaperDetail> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers/${paperId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to update teacher exam paper');
    return payload;
  },

  replaceItem: async (
    token: string,
    paperId: number,
    sectionId: number,
    itemId: number,
    body: { questionId?: number; groupId?: number }
  ): Promise<TeacherExamPaperDetail> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers/${paperId}/sections/${sectionId}/items/${itemId}/replace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to replace exam item');
    return payload;
  },

  getCandidates: async (
    token: string,
    params: {
      bookVersion?: string;
      grade?: string;
      semester?: string;
      unitCode?: string;
      difficulty?: string;
      knowledgeTag?: string;
      questionType: string;
      currentQuestionId?: number;
      currentGroupId?: number;
      keyword?: string;
      limit?: number;
    }
  ): Promise<TeacherExamQuestionCandidate[]> => {
    const q = new URLSearchParams({ questionType: params.questionType });
    if (params.bookVersion) q.set('bookVersion', params.bookVersion);
    if (params.grade) q.set('grade', params.grade);
    if (params.semester) q.set('semester', params.semester);
    if (params.unitCode) q.set('unitCode', params.unitCode);
    if (params.difficulty) q.set('difficulty', params.difficulty);
    if (params.knowledgeTag) q.set('knowledgeTag', params.knowledgeTag);
    if (typeof params.currentQuestionId === 'number') q.set('currentQuestionId', String(params.currentQuestionId));
    if (typeof params.currentGroupId === 'number') q.set('currentGroupId', String(params.currentGroupId));
    if (params.keyword) q.set('keyword', params.keyword);
    if (typeof params.limit === 'number') q.set('limit', String(params.limit));
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers/question-bank/candidates?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load replacement candidates');
    return payload;
  },

  deleteOne: async (token: string, paperId: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers/${paperId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete teacher exam paper');
    return payload;
  },

  deleteItem: async (token: string, paperId: number, sectionId: number, itemId: number): Promise<TeacherExamPaperDetail> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/teacher-exam-papers/${paperId}/sections/${sectionId}/items/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete exam item');
    return payload;
  },
};

export const studentTeacherExamApi = {
  getAssignment: async (token: string, assignmentId: number, userId: number): Promise<StudentTeacherExamAssignment> => {
    const q = new URLSearchParams({ userId: String(userId) });
    const response = await fetch(`${API_BASE_URL}/api/tests/student-teacher-papers/unit-assignment/${assignmentId}?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load student teacher exam assignment');
    return payload;
  },

  submit: async (
    token: string,
    assignmentId: number,
    body: {
      userId: number;
      durationSeconds?: number;
      answers: any;
      score: number;
      correctCount: number;
      totalCount: number;
      resultItems: Array<{
        sectionId: number;
        sectionItemId: number;
        itemType: string;
        questionId?: number | null;
        questionUid?: string;
        questionNo?: number | null;
        questionType: string;
        submittedAnswer: any;
        correctAnswer: any;
        correct: boolean;
        sourceFile?: string;
        sharedStem?: string;
        material?: string;
        stem?: string;
        options?: any;
        analysis?: string;
      }>;
    }
  ): Promise<StudentTeacherExamSubmissionResult> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/student-teacher-papers/unit-assignment/${assignmentId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to submit student teacher exam');
    return payload;
  },

  getWrongNotebook: async (token: string, userId: number): Promise<StudentTeacherExamWrongNotebookGroup[]> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/student-teacher-papers/wrong-notebook/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load student teacher exam wrong notebook');
    return payload;
  },
};

export const learningProgressApi = {
  getSession: async (token: string, userId: number, unitId: string, module: 'vocab' | 'phrase' | 'reading'): Promise<LearningSessionState | null> => {
    const q = new URLSearchParams({ userId: String(userId), unitId, module });
    const response = await fetch(`${API_BASE_URL}/api/tests/learning/session?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(payload?.error || 'Failed to load learning session');
    return payload as LearningSessionState | null;
  },

  upsertSession: async (
    token: string,
    body: { userId: number; unitId: string; module: 'vocab' | 'phrase' | 'reading'; stateJson: string }
  ): Promise<LearningSessionState> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/learning/session`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to save learning session');
    return payload;
  },

  getGroupProgress: async (
    token: string,
    userId: number,
    unitId: string,
    module: 'vocab' | 'phrase' | 'reading'
  ): Promise<LearningGroupProgress[]> => {
    const q = new URLSearchParams({ userId: String(userId), unitId, module });
    const response = await fetch(`${API_BASE_URL}/api/tests/learning/group-progress?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load group progress');
    return payload;
  },

  startGroup: async (
    token: string,
    body: { userId: number; unitId: string; module: 'vocab' | 'phrase' | 'reading'; groupNo: number; itemTotal: number }
  ): Promise<LearningGroupProgress> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/learning/group-progress/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to start group');
    return payload;
  },

  completeGroup: async (
    token: string,
    body: { userId: number; unitId: string; module: 'vocab' | 'phrase' | 'reading'; groupNo: number; itemTotal: number; learnedCount: number }
  ): Promise<LearningGroupProgress> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/learning/group-progress/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to complete group');
    return payload;
  },
};

export const studentCheckInApi = {
  getCalendar: async (token: string, year: number, month: number): Promise<StudentCheckInCalendarData> => {
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    const response = await fetch(`${API_BASE_URL}/api/users/students/check-in-calendar?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load student check-in calendar');
    return payload;
  },

  checkInToday: async (token: string): Promise<StudentCheckInCalendarData> => {
    const response = await fetch(`${API_BASE_URL}/api/users/students/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to check in today');
    return payload;
  },
};

export const studentLearningStatsApi = {
  get: async (token: string, userId: number): Promise<StudentLearningStats> => {
    const q = new URLSearchParams({ userId: String(userId) });
    const response = await fetch(`${API_BASE_URL}/api/tests/student-learning-stats?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load student learning stats');
    return payload;
  },
};

export const wordTestApi = {
  publish: async (token: string, request: PublishWordTestRequest) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-tests/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to publish word test');
    return payload;
  },

  getTeacherAssignments: async (token: string, teacherId: number, storeCode: string): Promise<WordTestAssignmentRow[]> => {
    const q = new URLSearchParams({ teacherId: String(teacherId), storeCode });
    const response = await fetch(`${API_BASE_URL}/api/tests/word-tests/teacher-assignments?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load word test assignments');
    return payload;
  },

  getStudentAssignments: async (token: string, userId: number): Promise<StudentWordTestAssignment[]> => {
    const q = new URLSearchParams({ userId: String(userId) });
    const response = await fetch(`${API_BASE_URL}/api/tests/word-tests/student-assignments?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load student word tests');
    return payload;
  },

  submitAssignment: async (
    token: string,
    assignmentId: number,
    request: {
      answers: Array<{ wordId: string; input: string; isCorrect: boolean }>;
      score: number;
      duration: number;
      correctCount: number;
      totalCount: number;
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/test-assignments/${assignmentId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to submit word test');
    return payload;
  },

  deleteOneAssignment: async (token: string, assignmentId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-tests/assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete word test assignment');
    return payload;
  },

  batchDeleteAssignments: async (token: string, assignmentIds: number[]) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-tests/assignments/batch-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assignmentIds }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to batch delete word test assignments');
    return payload;
  },
};

export const wordReviewApi = {
  publish: async (token: string, request: PublishWordReviewRequest) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-reviews/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to publish word review');
    return payload as { message: string };
  },

  getTeacherAssignments: async (token: string, teacherId: number, storeCode: string): Promise<WordReviewAssignmentRow[]> => {
    const q = new URLSearchParams({ teacherId: String(teacherId), storeCode });
    const response = await fetch(`${API_BASE_URL}/api/tests/word-reviews/teacher-assignments?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load teacher word reviews');
    return payload;
  },

  getStudentAssignments: async (token: string, userId: number): Promise<StudentWordReviewAssignment[]> => {
    const q = new URLSearchParams({ userId: String(userId) });
    const response = await fetch(`${API_BASE_URL}/api/tests/word-reviews/student-assignments?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load student word reviews');
    return payload;
  },

  startDailySession: async (token: string, assignmentId: number): Promise<WordReviewDailySession> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-reviews/assignments/${assignmentId}/start-daily-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to start daily review session');
    return payload;
  },

  submitDailySession: async (
    token: string,
    sessionId: number,
    request: {
      results: Array<{
        entryId: string;
        cardDone: boolean;
        enToZhCorrect: boolean;
        spellingCorrect?: boolean;
        zhToEnCorrect?: boolean;
      }>;
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-reviews/daily-sessions/${sessionId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to submit daily review');
    return payload as { message: string };
  },

  deleteOneAssignment: async (token: string, assignmentId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-reviews/assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete word review assignment');
    return payload as { message: string };
  },

  batchDeleteAssignments: async (token: string, assignmentIds: number[]) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/word-reviews/assignments/batch-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assignmentIds }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to batch delete word review assignments');
    return payload as { message: string };
  },
};

export const questionBankApi = {
  importJsonl: async (
    token: string,
    params: {
      file: File;
      bookVersion: string;
      grade: string;
      semester: string;
      unitCode?: string;
      sourceType?: string;
      overwriteMode?: 'skip_existing' | 'overwrite_existing';
      createdBy?: number;
    }
  ): Promise<QuestionBankImportResult> => {
    const form = new FormData();
    form.append('file', params.file);
    form.append('bookVersion', params.bookVersion);
    form.append('grade', params.grade);
    form.append('semester', params.semester);
    if (params.unitCode) form.append('unitCode', params.unitCode);
    if (params.sourceType) form.append('sourceType', params.sourceType);
    form.append('overwriteMode', params.overwriteMode || 'overwrite_existing');
    if (typeof params.createdBy === 'number') form.append('createdBy', String(params.createdBy));
    const response = await fetch(`${API_BASE_URL}/api/tests/question-bank/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to import question bank jsonl');
    return payload;
  },

  getImportBatches: async (
    token: string,
    params: {
      bookVersion?: string;
      grade?: string;
      semester?: string;
      unitCode?: string;
      status?: string;
      page?: number;
      size?: number;
    }
  ): Promise<SpringPage<QuestionBankImportBatch>> => {
    const q = new URLSearchParams();
    if (params.bookVersion) q.set('bookVersion', params.bookVersion);
    if (params.grade) q.set('grade', params.grade);
    if (params.semester) q.set('semester', params.semester);
    if (params.unitCode) q.set('unitCode', params.unitCode);
    if (params.status) q.set('status', params.status);
    q.set('page', String(params.page ?? 0));
    q.set('size', String(params.size ?? 20));
    const response = await fetch(`${API_BASE_URL}/api/tests/question-bank/import-batches?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load import batches');
    return payload;
  },

  getQuestions: async (
    token: string,
    params: {
      bookVersion?: string;
      grade?: string;
      semester?: string;
      unitCode?: string;
      questionType?: string;
      examScene?: string;
      status?: string;
      keyword?: string;
      sourceType?: string;
      batchId?: number;
      page?: number;
      size?: number;
    }
  ): Promise<SpringPage<QuestionBankQuestionSummary>> => {
    const q = new URLSearchParams();
    if (params.bookVersion) q.set('bookVersion', params.bookVersion);
    if (params.grade) q.set('grade', params.grade);
    if (params.semester) q.set('semester', params.semester);
    if (params.unitCode) q.set('unitCode', params.unitCode);
    if (params.questionType) q.set('questionType', params.questionType);
    if (params.examScene) q.set('examScene', params.examScene);
    if (params.status) q.set('status', params.status);
    if (params.keyword) q.set('keyword', params.keyword);
    if (params.sourceType) q.set('sourceType', params.sourceType);
    if (typeof params.batchId === 'number') q.set('batchId', String(params.batchId));
    q.set('page', String(params.page ?? 0));
    q.set('size', String(params.size ?? 50));
    const response = await fetch(`${API_BASE_URL}/api/tests/question-bank/questions?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load question bank items');
    return payload;
  },

  getQuestionDetail: async (token: string, id: number): Promise<QuestionBankQuestionDetail> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/question-bank/questions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load question detail');
    return payload;
  },

  updateQuestion: async (token: string, id: number, body: QuestionBankQuestionUpdateRequest): Promise<QuestionBankQuestionDetail> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/question-bank/questions/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to update question');
    return payload;
  },

  deleteQuestion: async (token: string, id: number): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE_URL}/api/tests/question-bank/questions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete question');
    return payload;
  },
};
