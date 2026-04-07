import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Users, BookOpen, Type, MessageSquare, FileText, 
  CheckSquare, Mic, Save, Plus, Trash2, Database, LogOut, ChevronDown
} from 'lucide-react';
import { 
  MOCK_USERS, MOCK_UNITS, MOCK_WORDS, MOCK_PHRASES, 
  MOCK_READING, MOCK_QUIZ, MOCK_PHONETICS 
} from '../data/mock';

type Tab = 'users' | 'textbooks' | 'words' | 'phrases' | 'reading' | 'exercises' | 'phonetics';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [isSaving, setIsSaving] = useState(false);
  const [isTextbooksExpanded, setIsTextbooksExpanded] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState('七年级上册 - Unit 1');

  // Local state for editing
  const [users, setUsers] = useState(Object.values(MOCK_USERS));
  const [units, setUnits] = useState(MOCK_UNITS);
  const [words, setWords] = useState(MOCK_WORDS);
  const [phrases, setPhrases] = useState(MOCK_PHRASES);
  const [reading, setReading] = useState(MOCK_READING);
  const [quizzes, setQuizzes] = useState(MOCK_QUIZ);
  const [phonetics, setPhonetics] = useState(MOCK_PHONETICS);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSave = () => {
    setIsSaving(true);
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      alert('数据已成功保存到后端数据库！');
    }, 1000);
  };

  const renderSidebar = () => (
    <div className="w-64 bg-surface-container-low border-r border-outline-variant/30 flex flex-col h-full">
      <div className="p-6 border-b border-outline-variant/30">
        <h2 className="text-xl font-black text-primary flex items-center gap-2">
          <Database className="w-6 h-6" />
          数据库管理
        </h2>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('users')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${
            activeTab === 'users' 
              ? 'bg-primary text-on-primary shadow-md' 
              : 'text-on-surface-variant hover:bg-surface-container-highest'
          }`}
        >
          <Users className="w-5 h-5" />
          账号管理
        </button>

        <div>
          <button
            onClick={() => {
              setIsTextbooksExpanded(!isTextbooksExpanded);
              if (!isTextbooksExpanded && !['textbooks', 'words', 'phrases', 'reading', 'exercises'].includes(activeTab)) {
                setActiveTab('textbooks');
              }
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${
              activeTab === 'textbooks' 
                ? 'bg-primary text-on-primary shadow-md' 
                : 'text-on-surface-variant hover:bg-surface-container-highest'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            教材与单元
            <ChevronDown className={`ml-auto w-4 h-4 transition-transform ${isTextbooksExpanded ? 'rotate-180' : ''}`} />
          </button>
          
          {isTextbooksExpanded && (
            <div className="ml-4 mt-2 space-y-1 border-l-2 border-outline-variant/30 pl-2">
              {[
                { id: 'words', icon: Type, label: '单词库' },
                { id: 'phrases', icon: MessageSquare, label: '短语库' },
                { id: 'reading', icon: FileText, label: '课文阅读' },
                { id: 'exercises', icon: CheckSquare, label: '练习题' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-colors text-sm ${
                    activeTab === item.id 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setActiveTab('phonetics')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${
            activeTab === 'phonetics' 
              ? 'bg-primary text-on-primary shadow-md' 
              : 'text-on-surface-variant hover:bg-surface-container-highest'
          }`}
        >
          <Mic className="w-5 h-5" />
          音标学习
        </button>
      </nav>
      <div className="p-4 border-t border-outline-variant/30">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-error-container text-on-error-container rounded-xl font-bold hover:bg-error hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </button>
      </div>
    </div>
  );

  const renderUnitSelector = () => (
    <select 
      value={selectedUnit}
      onChange={(e) => setSelectedUnit(e.target.value)}
      className="ml-4 bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-1.5 font-bold text-primary outline-none focus:border-primary text-base"
    >
      <option value="七年级上册 - Unit 1">七年级上册 - Unit 1</option>
      <option value="七年级上册 - Unit 2">七年级上册 - Unit 2</option>
      <option value="七年级下册 - Unit 1">七年级下册 - Unit 1</option>
    </select>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">账号管理</h3>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors">
                <Plus className="w-4 h-4" /> 新增账号
              </button>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    <th className="p-4 font-bold text-on-surface-variant">ID</th>
                    <th className="p-4 font-bold text-on-surface-variant">用户名</th>
                    <th className="p-4 font-bold text-on-surface-variant">姓名</th>
                    <th className="p-4 font-bold text-on-surface-variant">角色</th>
                    <th className="p-4 font-bold text-on-surface-variant text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr key={i} className="border-b border-outline-variant/20 hover:bg-surface-container-lowest/50">
                      <td className="p-4 font-mono text-sm">{user.id}</td>
                      <td className="p-4"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" defaultValue={user.username} /></td>
                      <td className="p-4"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" defaultValue={user.name} /></td>
                      <td className="p-4">
                        <select className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" defaultValue={user.role}>
                          <option value="student">学生</option>
                          <option value="teacher">老师</option>
                          <option value="admin">管理员</option>
                        </select>
                      </td>
                      <td className="p-4 text-right">
                        <button className="p-2 text-error hover:bg-error-container rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'textbooks':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">教材与单元</h3>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors">
                <Plus className="w-4 h-4" /> 新增教材
              </button>
            </div>
            {units.map((tb, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-6 mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <h4 className="text-xl font-bold">教材版本:</h4>
                  <input className="text-xl font-bold bg-transparent border-b-2 border-transparent hover:border-outline-variant focus:border-primary outline-none" defaultValue={tb.textbook} />
                </div>
                {tb.grades.map((g, j) => (
                  <div key={j} className="ml-6 mb-4 border-l-2 border-primary-container pl-4">
                    <div className="flex items-center gap-4 mb-2">
                      <h5 className="font-bold text-on-surface-variant">年级:</h5>
                      <input className="font-bold bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" defaultValue={g.grade} />
                    </div>
                    <div className="space-y-2">
                      {g.units.map((u, k) => (
                        <div key={k} className="flex items-center gap-4 bg-surface-container-low p-3 rounded-lg">
                          <input className="flex-1 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none font-bold" defaultValue={u.title} />
                          <input className="flex-1 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm text-on-surface-variant" defaultValue={u.subtitle} />
                          <button className="p-2 text-error hover:bg-error-container rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <button className="text-sm font-bold text-primary hover:underline flex items-center gap-1 mt-2">
                        <Plus className="w-3 h-3" /> 添加单元
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      case 'words':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h3 className="text-2xl font-black">单词库</h3>
                {renderUnitSelector()}
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors">
                <Plus className="w-4 h-4" /> 新增单词
              </button>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    <th className="p-4 font-bold text-on-surface-variant">英文</th>
                    <th className="p-4 font-bold text-on-surface-variant">音标</th>
                    <th className="p-4 font-bold text-on-surface-variant">中文</th>
                    <th className="p-4 font-bold text-on-surface-variant">单词音频</th>
                    <th className="p-4 font-bold text-on-surface-variant">例句</th>
                    <th className="p-4 font-bold text-on-surface-variant">例句中文</th>
                    <th className="p-4 font-bold text-on-surface-variant">例句音频</th>
                    <th className="p-4 font-bold text-on-surface-variant text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((word, i) => (
                    <tr key={i} className="border-b border-outline-variant/20 hover:bg-surface-container-lowest/50">
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none font-bold" defaultValue={word.en} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={word.phonetic} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={word.cn} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm text-secondary" defaultValue={word.audio} placeholder="audio.mp3" /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={word.sentence} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={word.sentenceCn} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm text-secondary" defaultValue={word.sentenceAudio} placeholder="sentence.mp3" /></td>
                      <td className="p-4 text-right">
                        <button className="p-2 text-error hover:bg-error-container rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'phrases':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h3 className="text-2xl font-black">短语库</h3>
                {renderUnitSelector()}
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors">
                <Plus className="w-4 h-4" /> 新增短语
              </button>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    <th className="p-4 font-bold text-on-surface-variant">英文短语</th>
                    <th className="p-4 font-bold text-on-surface-variant">中文释义</th>
                    <th className="p-4 font-bold text-on-surface-variant">短语音频</th>
                    <th className="p-4 font-bold text-on-surface-variant">例句</th>
                    <th className="p-4 font-bold text-on-surface-variant">例句中文</th>
                    <th className="p-4 font-bold text-on-surface-variant">例句音频</th>
                    <th className="p-4 font-bold text-on-surface-variant text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {phrases.map((phrase, i) => (
                    <tr key={i} className="border-b border-outline-variant/20 hover:bg-surface-container-lowest/50">
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none font-bold" defaultValue={phrase.en} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={phrase.cn} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm text-secondary" defaultValue={phrase.audio} placeholder="audio.mp3" /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={phrase.sentence} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={phrase.sentenceCn} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm text-secondary" defaultValue={phrase.sentenceAudio} placeholder="sentence.mp3" /></td>
                      <td className="p-4 text-right">
                        <button className="p-2 text-error hover:bg-error-container rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'reading':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h3 className="text-2xl font-black">课文阅读</h3>
                {renderUnitSelector()}
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">标题</label>
                <input className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 focus:border-primary outline-none font-bold text-xl" defaultValue={reading.title} />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">英文内容</label>
                <textarea className="w-full h-32 bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 focus:border-primary outline-none resize-none" defaultValue={reading.content} />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">中文翻译</label>
                <textarea className="w-full h-32 bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 focus:border-primary outline-none resize-none" defaultValue={reading.translation} />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">逐句精读与音频</label>
                <div className="space-y-3">
                  {reading.sentences?.map((s, i) => (
                    <div key={i} className="bg-surface-container-low p-4 rounded-lg relative group">
                      <button className="absolute top-4 right-4 p-2 text-error opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error-container rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      <div className="space-y-2 pr-10">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-on-surface-variant w-12">英文:</span>
                          <input className="flex-1 bg-transparent border-b border-outline-variant/50 focus:border-primary outline-none font-medium" defaultValue={s.en} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-on-surface-variant w-12">中文:</span>
                          <input className="flex-1 bg-transparent border-b border-outline-variant/50 focus:border-primary outline-none text-sm" defaultValue={s.cn} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-on-surface-variant w-12">音频:</span>
                          <input className="flex-1 bg-transparent border-b border-outline-variant/50 focus:border-primary outline-none text-sm text-secondary" defaultValue={s.audio} placeholder="sentence.mp3" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="text-sm font-bold text-primary hover:underline flex items-center gap-1 mt-2">
                    <Plus className="w-3 h-3" /> 添加句子
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">阅读理解题目</label>
                {reading.questions.map((q, i) => (
                  <div key={i} className="bg-surface-container-low p-4 rounded-lg mb-4 relative group">
                    <button className="absolute top-4 right-4 p-2 text-error opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error-container rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    <input className="w-full bg-transparent border-b border-outline-variant/50 focus:border-primary outline-none font-bold mb-2" defaultValue={q.question} />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {q.options.map((opt, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <input type="radio" name={`q-${i}`} defaultChecked={q.correct === j} />
                          <input className="flex-1 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={opt} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="text-sm font-bold text-primary hover:underline flex items-center gap-1 mt-2">
                  <Plus className="w-3 h-3" /> 添加题目
                </button>
              </div>
            </div>
          </div>
        );
      case 'exercises':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <h3 className="text-2xl font-black">练习题库</h3>
                {renderUnitSelector()}
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors">
                <Plus className="w-4 h-4" /> 新增题目
              </button>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-6 space-y-4">
              {quizzes.map((q, i) => (
                <div key={i} className="bg-surface-container-low p-4 rounded-lg relative group">
                  <button className="absolute top-4 right-4 p-2 text-error opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error-container rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  <div className="flex items-center gap-4 mb-3">
                    <select className="bg-surface-container-highest border-none rounded-lg p-2 text-sm font-bold outline-none" defaultValue={q.type}>
                      <option value="vocab">单词题</option>
                      <option value="phrase">短语题</option>
                      <option value="grammar">语法题</option>
                    </select>
                    <input className="flex-1 bg-transparent border-b border-outline-variant/50 focus:border-primary outline-none font-bold" defaultValue={q.question} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pl-32">
                    {q.options.map((opt, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <input type="radio" name={`quiz-${i}`} defaultChecked={q.correct === j} />
                        <input className="flex-1 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={opt} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'phonetics':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black">音标学习</h3>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors">
                <Plus className="w-4 h-4" /> 新增音标
              </button>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    <th className="p-4 font-bold text-on-surface-variant">音标</th>
                    <th className="p-4 font-bold text-on-surface-variant">类型</th>
                    <th className="p-4 font-bold text-on-surface-variant">常见字母组合</th>
                    <th className="p-4 font-bold text-on-surface-variant">示例单词</th>
                    <th className="p-4 font-bold text-on-surface-variant text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {phonetics.map((ph, i) => (
                    <tr key={i} className="border-b border-outline-variant/20 hover:bg-surface-container-lowest/50">
                      <td className="p-4"><input className="w-16 bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none font-bold text-xl text-center" defaultValue={ph.symbol} /></td>
                      <td className="p-4">
                        <select className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" defaultValue={ph.type}>
                          <option value="vowel">元音</option>
                          <option value="consonant">辅音</option>
                        </select>
                      </td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={ph.combinations.join(', ')} /></td>
                      <td className="p-4"><input className="w-full bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none text-sm" defaultValue={ph.example} /></td>
                      <td className="p-4 text-right">
                        <button className="p-2 text-error hover:bg-error-container rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex w-full h-screen overflow-hidden pt-16 bg-surface-bright">
      {renderSidebar()}
      
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-20 bg-surface-container-lowest border-b border-outline-variant/30 flex items-center justify-between px-8 shrink-0">
          <div>
            <h1 className="text-2xl font-black text-on-surface">数据库可视化管理</h1>
            <p className="text-sm text-on-surface-variant mt-1">编辑并同步所有教学数据与用户账号</p>
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-secondary text-on-secondary rounded-xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSaving ? (
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isSaving ? '保存中...' : '保存更改到数据库'}
          </button>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto custom-scrollbar p-8">
          <div className="max-w-6xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};
