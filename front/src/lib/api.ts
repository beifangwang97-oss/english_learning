const API_BASE_URL = 'http://localhost:8081'; // 以用户服务为例，实际应该通过 API 网关访问

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  avatar: string;
}

export interface Unit {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  progress: number;
  locked: boolean;
  isSpecial: boolean;
}

export interface Word {
  id: string;
  groupId: number;
  en: string;
  phonetic: string;
  cn: string;
  sentence: string;
  sentenceCn: string;
  options: string[];
}

export interface Phrase {
  id: string;
  groupId: number;
  en: string;
  cn: string;
  sentence: string;
  sentenceCn: string;
  options: string[];
}

export interface Reading {
  title: string;
  content: string;
  translation: string;
  questions: {
    id: string;
    question: string;
    options: string[];
    correct: number;
  }[];
}

export interface Quiz {
  id: string;
  type: 'vocab' | 'phrase' | 'grammar';
  question: string;
  options: string[];
  correct: number;
}

export interface Phonetic {
  id: string;
  symbol: string;
  type: 'vowel' | 'consonant';
  combinations: string[];
  example: string;
  exampleAudio: string;
  audio: string;
}

export interface WordTest {
  id: string;
  title: string;
  type: '听写' | '默写';
  unitId: string;
  status: 'pending' | 'completed';
  words: {
    id: string;
    en: string;
    cn: string;
    audio?: string;
  }[];
}

export interface StudentStats {
  id: string;
  name: string;
  grade: string;
  textbook: string;
  avatar: string;
  unitProgress: {
    grade: string;
    unit: string;
    groups: {
      groupName: string;
      words: {
        status: 'completed' | 'in-progress' | 'not-started';
        duration?: string;
        startTime?: string;
      };
      phrases: {
        status: 'completed' | 'in-progress' | 'not-started';
        duration?: string;
      };
      reading: {
        status: 'completed' | 'in-progress' | 'not-started';
        duration?: string;
      };
    }[];
    unitTest: {
      status: 'completed';
      score: number;
      completionTime: string;
      details: {
        id: string;
        question: string;
        options: string[];
        correct: number;
        studentAnswer: number;
        explanation: string;
      }[];
    };
  }[];
  wordTests: {
    id: string;
    title: string;
    type: '听写' | '默写';
    duration: string;
    score: number;
    completionTime: string;
  }[];
}

export interface Assessment {
  id: string;
  type: 'vocab' | 'grammar';
  question: string;
  options: string[];
  correct: number;
  studentAnswer: number;
  score: number;
}

// 认证相关 API
export const authApi = {
  login: async (username: string, password: string): Promise<{ user: User; token: string }> => {
    console.log('Sending login request to:', `${API_BASE_URL}/api/users/login`);
    console.log('Login credentials:', { username, password });
    
    const response = await fetch(`${API_BASE_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    console.log('Login response status:', response.status);
    console.log('Login response headers:', response.headers);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.log('Login error:', errorData);
      throw new Error('登录失败');
    }

    const responseData = await response.json();
    console.log('Login response data:', responseData);
    return responseData;
  },

  getCurrentUser: async (token: string): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/api/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取用户信息失败');
    }

    return response.json();
  },
};

// 学习内容相关 API
export const learningContentApi = {
  getUnits: async (token: string): Promise<any[]> => {
    const response = await fetch('http://localhost:8082/api/learning/units', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取单元列表失败');
    }

    return response.json();
  },

  getWords: async (token: string, unitId: string): Promise<Word[]> => {
    const response = await fetch(`http://localhost:8082/api/learning/units/${unitId}/words`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取单词列表失败');
    }

    return response.json();
  },

  getPhrases: async (token: string, unitId: string): Promise<Phrase[]> => {
    const response = await fetch(`http://localhost:8082/api/learning/units/${unitId}/phrases`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取短语列表失败');
    }

    return response.json();
  },

  getReading: async (token: string, unitId: string): Promise<Reading> => {
    const response = await fetch(`http://localhost:8082/api/learning/units/${unitId}/reading`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取阅读内容失败');
    }

    return response.json();
  },

  getQuiz: async (token: string, unitId: string): Promise<Quiz[]> => {
    const response = await fetch(`http://localhost:8082/api/learning/units/${unitId}/quiz`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取测验内容失败');
    }

    return response.json();
  },
};

// 测试相关 API
export const testApi = {
  getWordTests: async (token: string): Promise<WordTest[]> => {
    const response = await fetch('http://localhost:8083/api/tests/word-tests', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取单词测试列表失败');
    }

    return response.json();
  },

  submitWordTest: async (token: string, testId: string, answers: any[]): Promise<{ score: number }> => {
    const response = await fetch(`http://localhost:8083/api/tests/word-tests/${testId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ answers }),
    });

    if (!response.ok) {
      throw new Error('提交测试答案失败');
    }

    return response.json();
  },
};
