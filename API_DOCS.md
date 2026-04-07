# API Documentation

本文件汇总了学生端与老师端的所有核心 API 接口设计，包含请求参数与返回数据结构。

---

## 1. 学生端 API

### 1.1 获取控制面板数据
- **Path:** `/api/student/dashboard`
- **Method:** `GET`
- **Description:** 获取学生控制面板所需的基础数据。
- **Response:**
  ```json
  {
    "name": "张三",
    "avatar": "url",
    "stats": {
      "wordsLearned": 120,
      "daysStreak": 5,
      "accuracy": 95
    }
  }
  ```

### 1.2 获取单元学习列表
- **Path:** `/api/student/units`
- **Method:** `GET`
- **Description:** 获取学生本学期所有单元的学习状态。
- **Response:**
  ```json
  [
    {
      "id": "u1",
      "title": "Unit 1",
      "progress": 100,
      "isLocked": false
    }
  ]
  ```

### 1.3 获取单元单词数据
- **Path:** `/api/student/unit/:unitId/words`
- **Method:** `GET`
- **Description:** 获取指定单元的所有单词数据（分组、音标、翻译、例句及中文释义等）。
- **Response:**
  ```json
  [
    {
      "id": "w1",
      "groupId": 1,
      "en": "adventure",
      "phonetic": "/ədˈventʃə/",
      "cn": "n. 冒险；奇遇",
      "sentence": "They set out on a grand adventure across the mountains.",
      "sentenceCn": "他们出发去山里进行一次大冒险。",
      "options": ["优点", "冒险", "广告", "建议"]
    }
  ]
  ```

### 1.4 获取单元短语数据
- **Path:** `/api/student/unit/:unitId/phrases`
- **Method:** `GET`
- **Description:** 获取指定单元的所有短语数据（包含例句及中文释义）。
- **Response:**
  ```json
  [
    {
      "id": "p1",
      "groupId": 1,
      "en": "set out",
      "cn": "出发；开始",
      "sentence": "They set out on a grand adventure.",
      "sentenceCn": "他们出发去进行一次大冒险。",
      "options": ["出发", "建立", "解决", "放弃"]
    }
  ]
  ```

### 1.5 获取单元课文阅读内容
- **Path:** `/api/student/unit/:unitId/reading`
- **Method:** `GET`
- **Description:** 获取指定单元的课文阅读内容。
- **Response:**
  ```json
  {
    "title": "A Great Adventure",
    "content": "Last summer...",
    "translation": "去年夏天...",
    "questions": [
      {
        "id": "q1",
        "question": "Where did they go?",
        "options": ["Mountains", "Beach", "City", "Forest"],
        "answer": "Mountains",
        "explanation": "文章第一句提到..."
      }
    ]
  }
  ```

### 1.6 获取单元测试题目及解析
- **Path:** `/api/student/unit/:unitId/test`
- **Method:** `GET`
- **Description:** 获取指定单元的测试题目。
- **Response:**
  ```json
  [
    {
      "id": "t1",
      "question": "Choose the correct meaning: explore",
      "options": ["探索", "爆炸", "出口", "解释"],
      "answer": "探索",
      "explanation": "explore 意为探索。"
    }
  ]
  ```

### 1.7 提交单元学习进度/结果
- **Path:** `/api/student/unit/:unitId/progress`
- **Method:** `POST`
- **Description:** 提交学生在单元学习中的进度和测试结果。
- **Request Body:**
  ```json
  {
    "moduleId": "vocab", // vocab, phrase, reading, test
    "groupId": 1, // 可选
    "status": "completed",
    "duration": 120, // 耗时（秒）
    "score": 90 // 测试得分（可选）
  }
  ```
- **Response:**
  ```json
  { "success": true }
  ```

### 1.8 获取错题列表
- **Path:** `/api/student/notebook`
- **Method:** `GET`
- **Description:** 获取学生过往所有做错的题目列表及解析。
- **Response:**
  ```json
  [
    {
      "id": "n1",
      "word": "explore",
      "wrongAnswer": "爆炸",
      "correctAnswer": "探索",
      "date": "2023-10-01"
    }
  ]
  ```

### 1.9 获取音标学习数据
- **Path:** `/api/student/phonetics`
- **Method:** `GET`
- **Description:** 获取48个音标及字母组合数据，包含示例单词及音频。
- **Response:**
  ```json
  [
    {
      "id": "ph1",
      "symbol": "/i:/",
      "type": "vowel",
      "examples": [
        { "word": "see", "translation": "看见", "audioUrl": "url" }
      ]
    }
  ]
  ```

### 1.10 获取待完成单词测试
- **Path:** `/api/student/word-tests/pending`
- **Method:** `GET`
- **Description:** 获取教师发放的待完成单词测试任务列表。
- **Response:**
  ```json
  [
    {
      "id": "wt1",
      "title": "Unit 1 单词听写",
      "type": "dictation",
      "unitId": "u1",
      "words": [
        { "id": "w1", "en": "adventure", "cn": "冒险", "audioUrl": "url" }
      ]
    }
  ]
  ```

### 1.11 提交单词测试结果
- **Path:** `/api/student/word-tests/:testId/submit`
- **Method:** `POST`
- **Description:** 提交单词测试结果，前端进行打分后将结果同步至服务端。
- **Request Body:**
  ```json
  {
    "duration": 300,
    "score": 95,
    "answers": [
      { "wordId": "w1", "input": "adventure", "isCorrect": true }
    ]
  }
  ```
- **Response:**
  ```json
  { "success": true }
  ```

---

## 2. 老师端 API

### 2.1 获取控制台实时状态
- **Path:** `/api/teacher/dashboard`
- **Method:** `GET`
- **Description:** 获取当前所有在线学生的状态快照。
- **Response:**
  ```json
  {
    "onlineCount": 25,
    "activeStudents": [
      {
        "id": "s1",
        "name": "张三",
        "currentModule": "单词闯关",
        "progress": 80
      }
    ]
  }
  ```

### 2.2 获取教学设计数据
- **Path:** `/api/teacher/teaching-design-data`
- **Method:** `GET`
- **Description:** 获取学生列表及教材目录结构，用于分配任务。
- **Response:**
  ```json
  {
    "students": [{ "id": "s1", "name": "张三" }],
    "units": [{ "id": "u1", "title": "Unit 1" }]
  }
  ```

### 2.3 获取学生权限及账户信息
- **Path:** `/api/teacher/students/permissions`
- **Method:** `GET`
- **Description:** 获取该教师名下所有学生的权限及账户信息。
- **Response:**
  ```json
  [
    {
      "id": "s1",
      "name": "张三",
      "phone": "13800138000",
      "expireDate": "2024-12-31",
      "isActive": true
    }
  ]
  ```

### 2.4 获取学生学情进度详情
- **Path:** `/api/teacher/students/:studentId/analytics`
- **Method:** `GET`
- **Description:** 获取指定学生的详细学情进度，包括按学习组划分的单元学习情况以及单词测试的历史结果。
- **Response:**
  ```json
  {
    "unitProgress": [
      {
        "unitId": "u1",
        "unitTitle": "Unit 1",
        "groups": [
          {
            "groupId": 1,
            "vocab": { "status": "completed", "duration": 300 },
            "phrase": { "status": "in-progress", "startTime": "2023-10-01T10:00:00Z" },
            "reading": { "status": "not-started" }
          }
        ],
        "unitTest": { "score": 90, "duration": 600 }
      }
    ],
    "wordTests": [
      {
        "id": "wt1",
        "title": "Unit 1 单词听写",
        "type": "dictation",
        "score": 95,
        "duration": 300,
        "completedAt": "2023-10-01T10:05:00Z"
      }
    ]
  }
  ```

### 2.5 获取单词测试发布数据
- **Path:** `/api/teacher/word-test-data`
- **Method:** `GET`
- **Description:** 获取学生列表及教材目录结构，用于发布单词测试。
- **Response:**
  ```json
  {
    "students": [{ "id": "s1", "name": "张三" }],
    "units": [
      {
        "id": "u1",
        "title": "Unit 1",
        "words": [{ "id": "w1", "en": "adventure", "cn": "冒险" }]
      }
    ]
  }
  ```

### 2.6 发布单词测试任务
- **Path:** `/api/teacher/word-tests`
- **Method:** `POST`
- **Description:** 教师选择学生、单元及测试类型（听写/默写）后发布单词测试任务。
- **Request Body:**
  ```json
  {
    "studentIds": ["s1", "s2"],
    "unitId": "u1",
    "wordIds": ["w1", "w2"],
    "type": "dictation" // dictation 或 translation
  }
  ```
- **Response:**
  ```json
  { "success": true, "testId": "wt2" }
  ```
