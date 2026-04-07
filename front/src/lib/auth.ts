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
  gradePermissions: string[];
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
  createdAt?: string;
  updatedAt?: string;
}

export interface LearningSessionState {
  id?: number;
  userId: number;
  unitId: string;
  module: 'vocab' | 'phrase';
  stateJson: string;
  updatedAt?: string;
}

export interface LearningGroupProgress {
  id?: number;
  userId: number;
  unitId: string;
  module: 'vocab' | 'phrase';
  groupNo: number;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  itemTotal?: number;
  learnedCount?: number;
  updatedAt?: string;
}

export interface WordTestGroupScope {
  textbookVersion: string;
  grade: string;
  semester: string;
  unit: string;
  groupNo: number;
}

export interface WordTestContentItem {
  entryId: string;
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
  testType: '默写' | '听写';
  status: 'pending' | 'completed';
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
  testType: '默写' | '听写';
  studentIds: number[];
  scopes: WordTestGroupScope[];
  items: WordTestContentItem[];
}
export interface WordTestAssignmentRow {
  assignmentId: number;
  testId: string;
  userId: number;
  title: string;
  testType: '默写' | '听写';
  status: string;
  score?: number | null;
  correctCount?: number | null;
  totalCount?: number | null;
  duration?: number | null;
  storeCode: string;
  createdAt?: string;
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
      throw new Error(payload?.error || '鐧诲綍澶辫触');
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
      throw new Error(payload?.error || '鑾峰彇鐢ㄦ埛淇℃伅澶辫触');
    }

    return payload;
  },

  logout: async (token: string): Promise<void> => {
    if (!token) return;
    await fetch(`${API_BASE_URL}/api/users/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
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
      Partial<Pick<AdminUser, 'expireDate'>>
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
        phone: data.username,
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
    data: Partial<Pick<AdminUser, 'username' | 'name' | 'loginPassword' | 'textbookVersion' | 'grade' | 'expireDate' | 'active'>>
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
        phone: data.username,
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
    data: Pick<AdminStore, 'storeName' | 'teacherMax' | 'studentMax' | 'textbookPermissions' | 'gradePermissions'>
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
    data: Partial<Pick<AdminStore, 'storeName' | 'teacherMax' | 'studentMax' | 'textbookPermissions' | 'gradePermissions'>>
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
    request: { assignedBy: number; studentIds: number[]; units: UnitTaskItem[] }
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

export const learningProgressApi = {
  getSession: async (token: string, userId: number, unitId: string, module: 'vocab' | 'phrase'): Promise<LearningSessionState | null> => {
    const q = new URLSearchParams({ userId: String(userId), unitId, module });
    const response = await fetch(`${API_BASE_URL}/api/tests/learning/session?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Failed to load learning session');
    return payload;
  },

  upsertSession: async (
    token: string,
    body: { userId: number; unitId: string; module: 'vocab' | 'phrase'; stateJson: string }
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
    module: 'vocab' | 'phrase'
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
    body: { userId: number; unitId: string; module: 'vocab' | 'phrase'; groupNo: number; itemTotal: number }
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
    body: { userId: number; unitId: string; module: 'vocab' | 'phrase'; groupNo: number; itemTotal: number; learnedCount: number }
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

