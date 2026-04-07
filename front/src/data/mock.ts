export type Role = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  avatar: string;
}

export const MOCK_USERS: Record<string, User> = {
  'student/123': {
    id: 's123',
    username: 'student',
    name: '张三',
    role: 'student',
    avatar: 'https://example.com/student.png',
  },
  'teacher/123': {
    id: 't123',
    username: 'teacher',
    name: '李老师',
    role: 'teacher',
    avatar: 'https://example.com/teacher.png',
  },
  'admin/123': {
    id: 'a123',
    username: 'admin',
    name: '管理员',
    role: 'admin',
    avatar: 'https://example.com/admin.png',
  },
};

export const MOCK_UNITS = [
  {
    textbook: '人教版',
    grades: [
      {
        grade: '八年级',
        units: [
          { id: 'u1', title: 'Unit 1', subtitle: 'My Day', desc: 'Unit intro', progress: 80, locked: false, isSpecial: false },
          { id: 'u2', title: 'Unit 2', subtitle: 'School Life', desc: 'Unit intro', progress: 20, locked: false, isSpecial: false },
        ],
      },
    ],
  },
];

export const MOCK_WORDS = [
  { id: 'w1', groupId: 1, en: 'family', phonetic: '/famili/', cn: '家庭', sentence: 'This is my family.', sentenceCn: '这是我的家庭。', options: ['家庭', '学校', '门店', '老师'], audio: 'family.mp3', sentenceAudio: 'family_sentence.mp3' },
  { id: 'w2', groupId: 1, en: 'student', phonetic: '/student/', cn: '学生', sentence: 'I am a student.', sentenceCn: '我是一名学生。', options: ['学生', '老师', '家长', '同事'], audio: 'student.mp3', sentenceAudio: 'student_sentence.mp3' },
];

export const MOCK_PHRASES = [
  { id: 'p1', groupId: 1, en: 'look after', cn: '照顾', sentence: 'She looks after her brother.', sentenceCn: '她照顾她弟弟。', options: ['照顾', '放弃', '建立', '发现'], audio: 'look_after.mp3', sentenceAudio: 'look_after_sentence.mp3' },
];

export const MOCK_READING = {
  title: 'A Nice Day',
  content: 'Today is sunny. We go to school and learn English.',
  translation: '今天天气晴朗。我们去学校学习英语。',
  sentences: [
    { en: 'Today is sunny.', cn: '今天天气晴朗。', audio: 'r1.mp3' },
    { en: 'We go to school and learn English.', cn: '我们去学校学习英语。', audio: 'r2.mp3' },
  ],
  questions: [
    { id: 'rq1', question: 'How is the weather?', options: ['Sunny', 'Rainy', 'Snowy', 'Windy'], correct: 0 },
  ],
};

export const MOCK_QUIZ = [
  { id: 'q1', type: 'vocab', question: 'family means?', options: ['家庭', '学校', '学生', '老师'], correct: 0 },
  { id: 'q2', type: 'phrase', question: 'look after means?', options: ['照顾', '放弃', '发现', '开始'], correct: 0 },
];

export const MOCK_PHONETICS = [
  { id: 'ph1', symbol: '/i:/', type: 'vowel', combinations: ['ee'], example: 'see', exampleAudio: 'see.mp3', audio: 'i_long.mp3' },
  { id: 'ph2', symbol: '/p/', type: 'consonant', combinations: ['p'], example: 'pen', exampleAudio: 'pen.mp3', audio: 'p.mp3' },
];

export const MOCK_WORD_TESTS = [
  {
    id: 'wt1',
    title: '2026年4月5日单词测试',
    type: '听写',
    unitId: 'u1',
    status: 'pending',
    words: [
      { id: 'w1', en: 'family', cn: '家庭', audio: 'family.mp3' },
      { id: 'w2', en: 'student', cn: '学生', audio: 'student.mp3' },
    ],
  },
  {
    id: 'wt2',
    title: '2026年4月6日单词测试',
    type: '默写',
    unitId: 'u2',
    status: 'pending',
    words: [
      { id: 'w3', en: 'teacher', cn: '老师' },
      { id: 'w4', en: 'school', cn: '学校' },
    ],
  },
];

export const MOCK_STUDENT_STATS = [
  {
    id: 'st1',
    name: 'Alex',
    grade: '八年级',
    textbook: '人教版',
    avatar: 'https://example.com/alex.png',
    unitProgress: [
      {
        grade: '八年级',
        unit: 'Unit 1',
        groups: [
          {
            groupName: 'Group 1',
            words: { status: 'completed', duration: '12分' },
            phrases: { status: 'completed', duration: '8分' },
            reading: { status: 'completed', duration: '6分' },
          },
        ],
        unitTest: {
          status: 'completed',
          score: 95,
          completionTime: '2026-04-05 10:00',
          details: [
            {
              id: 'd1',
              question: 'family means?',
              options: ['家庭', '学校', '学生', '老师'],
              correct: 0,
              studentAnswer: 0,
              explanation: 'family = 家庭',
            },
          ],
        },
      },
    ],
    wordTests: [
      {
        id: 'wt1',
        title: '2026年4月5日单词测试',
        type: '听写',
        duration: '5分',
        score: 100,
        completionTime: '2026-04-05 11:00',
      },
    ],
  },
];

export const MOCK_ASSESSMENT = [
  { id: 'a1', type: 'vocab', question: 'family?', options: ['家庭', '学校', '老师', '门店'], correct: 0, studentAnswer: 0, score: 10 },
];
