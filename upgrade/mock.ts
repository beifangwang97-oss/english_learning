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
    name: '张三 (Zhang San)',
    role: 'student',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBEPCweMPfl5GhHod0XF8DTzRW_g3iCOlsxRbyHNLI0eIDoNMlFgcZhXYz2LGheP9KSQDEykGUJw9e-0RrNTc0uTOyOjbcHl22D9d8u9gfT0Igy9m4hcb4aIsvjs3WGIgiGAdcduYcJBvgiwh9z-5uNnapZuvcH_zKPWBOd-alJfhXj9w6CTJYDWrGHD8Lv-mc246sW435X79Oi0vPnBs179dRseVy2c6Db7Lqj2rf86U3rMHaGvFinE77CVNMjX-xEu5VUjjyGPPwc'
  },
  'teacher/123': {
    id: 't123',
    username: 'teacher',
    name: 'Sarah Jenkins',
    role: 'teacher',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCR1-Z_KhcNfvGNdX5BISJuKbglIHB58iaYVQ8JVoFJTQWDDUlkyqpn545_4i4kONgPRF6a-M1EiKS1ic3OWEwaCHlAqeCxwMZ7IfElw0U2kvJdVriLnsOpZvrw7g5XjJMuq5qvB-_xp8ACoJqJ4jOMUz-ZkfpVFLshYqu52isZHizuRTDbvo7pfBy9Vkiv1oybQ9Isol6i7S13DcOri1R9_Rod-yXBcmaQK7gPel0S9jQpwwTAwovVAyBLCg3bSuam-uPH04TxtBX6'
  },
  'admin/123': {
    id: 'a123',
    username: 'admin',
    name: 'Admin User',
    role: 'admin',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAsVEEztA1Yz6l50QS3D8zyIJUWtzCcb0HSCOPECXmzHq7bJommSOc8Fv4cONsYb1cnxJPE4V9boyFSiXJWx8TxyCE6Am945fCIg9udRG9Yo5rOL1YR1uVJRF2MDUAU37LK4jHNdqU7a4zl0dEBqokDykpUyqj1_LtuwtzGR8mg3I1kwz2JPil9K9CH5R2fz7Pp4YFjBrzscVhOwiuXEEjrlyyeGfBcQ24bLUcFboEStPFHlCacP_3u9ncF0NQ8YukuTxuSilNtlq2H'
  }
};

export const MOCK_UNITS = [
  {
    textbook: '人教版',
    grades: [
      {
        grade: '5年级',
        units: [
          { id: 'u1', title: 'Unit 1: My Family', subtitle: 'Family Members', desc: 'Learn about family members and relationships.', progress: 85, locked: false, isSpecial: false },
          { id: 'u2', title: 'Unit 2: My School', subtitle: 'School Life', desc: 'Explore school life and subjects.', progress: 42, locked: false, isSpecial: false }
        ]
      }
    ]
  },
  {
    textbook: '外研社版',
    grades: [
      {
        grade: '6年级',
        units: [
          { id: 'u3', title: 'Unit 1: Wild Animals', subtitle: 'Animals in Nature', desc: 'Discover wild animals and their habitats.', progress: 0, locked: true, isSpecial: false },
          { id: 'u4', title: 'Unit 2: Summer Adventures', subtitle: 'Summer Fun', desc: 'Enjoy summer adventures and activities.', progress: 0, locked: false, isSpecial: true }
        ]
      }
    ]
  }
];

export const MOCK_WORDS = [
  { id: 'w1', groupId: 1, en: 'adventure', phonetic: '/ədˈventʃə/', cn: 'n. 冒险；奇遇', sentence: 'They set out on a grand adventure across the mountains.', sentenceCn: '他们出发去山里进行一次大冒险。', options: ['优点', '冒险', '广告', '建议'], audio: 'adventure.mp3', sentenceAudio: 'adventure_sentence.mp3' },
  { id: 'w2', groupId: 1, en: 'explore', phonetic: '/ɪkˈsplɔːr/', cn: 'v. 探索；探测', sentence: 'We decided to explore the old castle.', sentenceCn: '我们决定去探索那座古堡。', options: ['解释', '探索', '爆炸', '出口'], audio: 'explore.mp3', sentenceAudio: 'explore_sentence.mp3' },
  { id: 'w3', groupId: 2, en: 'journey', phonetic: '/ˈdʒɜːrni/', cn: 'n. 旅行；旅程', sentence: 'The journey took three days.', sentenceCn: '这趟旅程花了三天时间。', options: ['旅行', '日记', '法官', '果汁'], audio: 'journey.mp3', sentenceAudio: 'journey_sentence.mp3' },
  { id: 'w4', groupId: 2, en: 'discover', phonetic: '/dɪˈskʌvər/', cn: 'v. 发现', sentence: 'Scientists discover new species every year.', sentenceCn: '科学家们每年都会发现新物种。', options: ['讨论', '发现', '折扣', '疾病'], audio: 'discover.mp3', sentenceAudio: 'discover_sentence.mp3' },
  { id: 'w5', groupId: 2, en: 'nature', phonetic: '/ˈneɪtʃər/', cn: 'n. 自然；本性', sentence: 'She loves spending time in nature.', sentenceCn: '她喜欢在大自然中度过时光。', options: ['国家', '自然', '本地', '海军'], audio: 'nature.mp3', sentenceAudio: 'nature_sentence.mp3' },
];

export const MOCK_PHRASES = [
  { id: 'p1', groupId: 1, en: 'set out', cn: '出发；开始', sentence: 'They set out on a grand adventure.', sentenceCn: '他们出发去进行一次大冒险。', options: ['出发', '建立', '解决', '放弃'], audio: 'set_out.mp3', sentenceAudio: 'set_out_sentence.mp3' },
  { id: 'p2', groupId: 1, en: 'look forward to', cn: '期待', sentence: 'I look forward to seeing you soon.', sentenceCn: '我期待着很快能见到你。', options: ['回顾', '期待', '寻找', '照顾'], audio: 'look_forward_to.mp3', sentenceAudio: 'look_forward_to_sentence.mp3' },
  { id: 'p3', groupId: 2, en: 'give up', cn: '放弃', sentence: 'Never give up on your dreams.', sentenceCn: '永远不要放弃你的梦想。', options: ['交出', '分发', '放弃', '屈服'], audio: 'give_up.mp3', sentenceAudio: 'give_up_sentence.mp3' },
];

export const MOCK_READING = {
  title: 'A Great Adventure',
  content: 'Last summer, my family and I decided to explore the mountains. We set out early in the morning. The journey was long, but we were excited to discover new things in nature. We saw many wild animals and beautiful flowers. It was an unforgettable experience.',
  translation: '去年夏天，我和家人决定去探索群山。我们一大早就出发了。旅途很漫长，但我们很兴奋能在自然中发现新事物。我们看到了许多野生动物和美丽的花朵。这是一次难忘的经历。',
  sentences: [
    { en: 'Last summer, my family and I decided to explore the mountains.', cn: '去年夏天，我和家人决定去探索群山。', audio: 'reading_s1.mp3' },
    { en: 'We set out early in the morning.', cn: '我们一大早就出发了。', audio: 'reading_s2.mp3' },
    { en: 'The journey was long, but we were excited to discover new things in nature.', cn: '旅途很漫长，但我们很兴奋能在自然中发现新事物。', audio: 'reading_s3.mp3' },
    { en: 'We saw many wild animals and beautiful flowers.', cn: '我们看到了许多野生动物和美丽的花朵。', audio: 'reading_s4.mp3' },
    { en: 'It was an unforgettable experience.', cn: '这是一次难忘的经历。', audio: 'reading_s5.mp3' }
  ],
  questions: [
    { id: 'rq1', question: 'When did the family set out?', options: ['In the evening', 'At noon', 'Early in the morning', 'At midnight'], correct: 2 },
    { id: 'rq2', question: 'What did they want to discover?', options: ['New cities', 'New things in nature', 'Old castles', 'Hidden treasures'], correct: 1 }
  ]
};

export const MOCK_QUIZ = [
  { id: 'q1', type: 'vocab', question: 'Which word means "to travel in order to learn about a place"?', options: ['discover', 'explore', 'journey', 'nature'], correct: 1 },
  { id: 'q2', type: 'phrase', question: 'What does "set out" mean?', options: ['to finish', 'to start a journey', 'to give up', 'to look for'], correct: 1 },
  { id: 'q3', type: 'grammar', question: 'Choose the correct form: "They _____ on a journey yesterday."', options: ['set out', 'sets out', 'setting out', 'will set out'], correct: 0 },
];

export const MOCK_PHONETICS = [
  { id: 'ph1', symbol: '/i:/', type: 'vowel', combinations: ['ee', 'ea', 'e', 'ie'], example: 'see', exampleAudio: 'see.mp3', audio: 'i_long.mp3' },
  { id: 'ph2', symbol: '/ɪ/', type: 'vowel', combinations: ['i', 'y', 'e'], example: 'sit', exampleAudio: 'sit.mp3', audio: 'i_short.mp3' },
  { id: 'ph3', symbol: '/e/', type: 'vowel', combinations: ['e', 'ea', 'a'], example: 'bed', exampleAudio: 'bed.mp3', audio: 'e.mp3' },
  { id: 'ph4', symbol: '/æ/', type: 'vowel', combinations: ['a'], example: 'cat', exampleAudio: 'cat.mp3', audio: 'ae.mp3' },
  { id: 'ph5', symbol: '/p/', type: 'consonant', combinations: ['p', 'pp'], example: 'pen', exampleAudio: 'pen.mp3', audio: 'p.mp3' },
  { id: 'ph6', symbol: '/b/', type: 'consonant', combinations: ['b', 'bb'], example: 'boy', exampleAudio: 'boy.mp3', audio: 'b.mp3' },
];

export const MOCK_WORD_TESTS = [
  {
    id: 'wt1',
    title: 'Unit 1: My Family (听写)',
    type: 'dictation', // dictation or translation
    unitId: 'u1',
    status: 'pending', // pending, completed
    words: [
      { id: 'w1', en: 'family', cn: 'n. 家庭', audio: 'family.mp3' },
      { id: 'w2', en: 'father', cn: 'n. 父亲', audio: 'father.mp3' },
      { id: 'w3', en: 'mother', cn: 'n. 母亲', audio: 'mother.mp3' },
    ]
  },
  {
    id: 'wt2',
    title: 'Unit 2: My School (默写)',
    type: 'translation',
    unitId: 'u2',
    status: 'pending',
    words: [
      { id: 'w4', en: 'school', cn: 'n. 学校' },
      { id: 'w5', en: 'teacher', cn: 'n. 教师' },
      { id: 'w6', en: 'student', cn: 'n. 学生' },
    ]
  }
];

export const MOCK_STUDENT_STATS = [
  { 
    id: 'st1', 
    name: 'Alex Rivera', 
    grade: '5年级',
    textbook: '人教版',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDT5auB5dcjSi4cXbwt0oCXnqN1fnL43A5itr7V9ds9WO2wMM0jiMVs8vIGY3doI0z4lfNtEbrtQdhb_pjXREdirXL8WKYnVjTCvAbZVNHPj7gTBFZDpyCLuEoNKSibyBy2kYVMoJffOq5gxa078wEsbkcG-UBqScS0w_U6RHckEyJM3vFRdaksKnvDpprvqDOD1Ec6Fh1hJcC0wBUv0I85dkWx-a-5qMweOJuW9v0_bqW7ARl25HIuP9i1bYVNDl88lsZGV6piD19x',
    unitProgress: [
      {
        grade: '5年级',
        unit: 'Unit 1: My Family',
        groups: [
          {
            groupName: 'Group 1',
            words: { status: 'completed', duration: '12分 45秒' },
            phrases: { status: 'completed', duration: '8分 20秒' },
            reading: { status: 'completed', duration: '10分 15秒' }
          },
          {
            groupName: 'Group 2',
            words: { status: 'in-progress', startTime: '10:30' },
            phrases: { status: 'not-started' },
            reading: { status: 'not-started' }
          }
        ],
        unitTest: {
          status: 'completed',
          score: 92,
          completionTime: '2026-03-29 10:00',
          details: [
            { id: 'q1', question: 'Which word means "family"?', options: ['Family', 'School', 'Friend', 'Teacher'], correct: 0, studentAnswer: 0, explanation: 'Family means a group of people related by blood or marriage.' },
            { id: 'q2', question: 'What is "father" in Chinese?', options: ['母亲', '父亲', '哥哥', '妹妹'], correct: 1, studentAnswer: 1, explanation: 'Father means 父亲.' }
          ]
        }
      }
    ],
    wordTests: [
      {
        id: 'wt1',
        title: 'Unit 1: My Family (听写)',
        type: 'dictation',
        duration: '5分 30秒',
        score: 100,
        completionTime: '2026-03-30 14:00'
      }
    ]
  },
  { 
    id: 'st2', 
    name: 'Linh Chen', 
    grade: '5年级',
    textbook: '人教版',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDpgeRwX_g46uWCkAfFdAPUag5anAVhIZMK4UdrdWcw7CVbOjWcnH3y0KyhW3Dur9UD8ENnpSfClP-oxL1avTzR0GM-STdkx6on1iWFujs7V9wiZRIW6KsUmM6Lo8khiJUfCGPd8hf1nacTY0gjndIPH7SJKsdjwFOuHJFM2T66y9_EP25P0QiItrA5AvdMjGFNhNU2YZeJ2a-gZ5oIO_tI586JwzXqzBALMEpIiw2AtMK-iYXEvlac7WwMVY7TAn-lxAxU5cazz637',
    unitProgress: [],
    wordTests: []
  }
];

export const MOCK_ASSESSMENT = [
  { id: 'q1', type: 'vocab', question: '选择最符合描述“正在发生”动作的单词。', options: ['Yesterday', 'Currently', 'Before', 'Earlier'], correct: 1, studentAnswer: 1, score: 10 },
  { id: 'q2', type: 'grammar', question: '指出语法错误："He were walking to the park when it started to rain."', options: ['"it started"', '"He were"', '"to the park"', '"when"'], correct: 1, studentAnswer: 0, score: 0 },
];
