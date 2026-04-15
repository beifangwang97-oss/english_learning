import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTimer } from '../context/TimerContext';
import { useAuth } from '../context/AuthContext';
import { adminStoreApi, authApi, learningProgressApi, unitAssignmentApi } from '../lib/auth';
import { getSessionToken } from '../lib/session';
import { lexiconApi, TextbookUnitItem } from '../lib/lexicon';
import { BookOpen, Play, Lock, CheckCircle2, Hourglass, Flame, Award, LayoutDashboard, Library, NotebookPen, ArrowRight, MessageCircle, FileQuestion, LogOut, Mic2, ClipboardList } from 'lucide-react';
import { PhoneticsView } from '../components/student/PhoneticsView';
import { WordTestView } from '../components/student/WordTestView';
import { WordReviewView } from '../components/student/WordReviewView';

type StudentUnitCard = {
  id: string;
  unitCode: string;
  scopeLabel: string;
  desc: string;
  title: string;
  progress: number;
  locked: boolean;
  isSpecial: boolean;
};

type UnitScope = {
  bookVersion: string;
  grade: string;
  semester: string;
};

function normalizeLegacyTextbookPermission(permission: string, mergedTextbooks: string[]) {
  const p = (permission || '').trim();
  if (!p) return '';
  if (mergedTextbooks.includes(p)) return p;
  const mapping: Record<string, string[]> = {
    PEP: ['人教版'],
    FLTRP: ['外研版'],
    SHJ: ['上海版'],
  };
  const aliases = mapping[p] || [];
  const hit = mergedTextbooks.find((bv) => aliases.includes(bv));
  return hit || p;
}

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { pauseTimer } = useTimer();
  const { logout, user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'units' | 'notebook' | 'phonetics' | 'word-tests' | 'word-reviews'>('dashboard');
  const [checkedIn, setCheckedIn] = useState(false);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [allUnits, setAllUnits] = useState<StudentUnitCard[]>([]);
  const today = new Date().getDate();

  useEffect(() => {
    document.title = '虎子英语_学生端';
  }, []);

  const handleCheckIn = () => {
    if (!checkedIn) {
      setCheckedIn(true);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Pause timer when on dashboard
  useEffect(() => {
    pauseTimer();
  }, [pauseTimer]);

  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail);
      }
    };
    window.addEventListener('change-tab', handleTabChange);
    return () => window.removeEventListener('change-tab', handleTabChange);
  }, []);

  useEffect(() => {
    const loadUnits = async () => {
      if (!token || !user || user.role !== 'student') return;
      setUnitsLoading(true);
      setUnitsError(null);
      try {
        const [latestUser, stores, assignments, taskTreePayload] = await Promise.all([
          authApi.getCurrentUser(token),
          adminStoreApi.getAllStores(token),
          unitAssignmentApi.getByStudent(token, Number(user.id)),
          lexiconApi.getTaskTree(token),
        ]);

        const studentTextbook = ((latestUser as any).textbookVersion || '').trim();
        const studentGrade = ((latestUser as any).grade || '').trim();
        const storeCode = ((latestUser as any).storeName || user.storeName || '').trim();
        if (!studentTextbook || !studentGrade) {
          setAllUnits([]);
          setUnitsError('当前学生未配置教材或年级，请联系老师或管理员完善账号信息。');
          return;
        }

        const store = stores.find((s) => s.storeCode === storeCode);
        const rawTree = taskTreePayload.tree || [];
        const mergedTextbooks = Array.from(new Set(rawTree.map((b) => b.bookVersion).filter(Boolean)));
        const allowedTextbooksRaw = (store?.textbookPermissions || [])
          .map((p) => normalizeLegacyTextbookPermission(p, mergedTextbooks))
          .filter(Boolean);
        const allowedGrades = (store?.gradePermissions || []).filter(Boolean);
        const hasStorePermission = Boolean(store && allowedTextbooksRaw.length > 0 && allowedGrades.length > 0);

        const unlockedSet = new Set(
          (assignments || []).map((a) => `${a.textbookVersion}||${a.grade}||${a.semester}||${a.unitName}`)
        );

        const unitScopes: UnitScope[] = [];
        rawTree.forEach((book) => {
          if (book.bookVersion !== studentTextbook) return;
          if (hasStorePermission && !allowedTextbooksRaw.includes(book.bookVersion)) return;
          (book.grades || []).forEach((gradeNode) => {
            if (gradeNode.grade !== studentGrade) return;
            if (hasStorePermission && !allowedGrades.includes(gradeNode.grade)) return;
            (gradeNode.semesters || []).forEach((semesterNode) => {
              unitScopes.push({
                bookVersion: book.bookVersion,
                grade: gradeNode.grade,
                semester: semesterNode.semester,
              });
            });
          });
        });

        const uniqueScopes = Array.from(
          new Map(unitScopes.map((scope) => [`${scope.bookVersion}||${scope.grade}||${scope.semester}`, scope])).values()
        );

        const scopeUnitsList = await Promise.all(
          uniqueScopes.map(async (scope) => {
            const unitPayload = await lexiconApi.getUnits(token, scope.bookVersion, scope.grade, scope.semester);
            return {
              scope,
              items: (unitPayload.items || []).slice().sort((a, b) => {
                const byOrder = (a.sort_order || 0) - (b.sort_order || 0);
                if (byOrder !== 0) return byOrder;
                return a.unit.localeCompare(b.unit, 'zh-CN');
              }),
            };
          })
        );

        const unlockedUnits = new Set(
          scopeUnitsList
            .flatMap((scopeRow) => scopeRow.items)
            .map((item) => `${item.book_version}||${item.grade}||${item.semester}||${item.unit}`)
            .filter((key) => unlockedSet.has(key))
        );

        const progressEntries = await Promise.all(
          Array.from(unlockedUnits).map(async (unitId) => {
            const [bookVersion, grade, semester, unitName] = unitId.split('||');
            const [wordSummary, phraseSummary, allPassages, vocabRows, phraseRows, readingRows] = await Promise.all([
              lexiconApi.getLearningSummary(token, { type: 'word', bookVersion, grade, semester, unit: unitName }).catch(() => null),
              lexiconApi.getLearningSummary(token, { type: 'phrase', bookVersion, grade, semester, unit: unitName }).catch(() => null),
              lexiconApi.getPassages(token, bookVersion, grade, semester).catch(() => ({ items: [] as any[] })),
              learningProgressApi.getGroupProgress(token, Number(user.id), unitId, 'vocab').catch(() => []),
              learningProgressApi.getGroupProgress(token, Number(user.id), unitId, 'phrase').catch(() => []),
              learningProgressApi.getGroupProgress(token, Number(user.id), unitId, 'reading').catch(() => []),
            ]);

            const calcLearned = (rows: Array<{ completedAt?: string; learnedCount?: number; itemTotal?: number }>) =>
              rows.reduce((sum, row) => {
                if (typeof row.learnedCount === 'number' && row.learnedCount >= 0) {
                  return sum + row.learnedCount;
                }
                if (row.completedAt && typeof row.itemTotal === 'number' && row.itemTotal >= 0) {
                  return sum + row.itemTotal;
                }
                return sum;
              }, 0);

            const wordTotal = Number(wordSummary?.total || 0);
            const phraseTotal = Number(phraseSummary?.total || 0);
            const readingTotal = Array.isArray(allPassages?.items)
              ? allPassages.items.filter((x: any) => (x.unit || '').trim().toLowerCase() === unitName.trim().toLowerCase()).length
              : 0;

            const wordLearned = Math.min(wordTotal, calcLearned(vocabRows as any[]));
            const phraseLearned = Math.min(phraseTotal, calcLearned(phraseRows as any[]));
            const readingLearned = Math.min(readingTotal, calcLearned(readingRows as any[]));

            const total = wordTotal + phraseTotal + readingTotal;
            const learned = wordLearned + phraseLearned + readingLearned;
            const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((learned / total) * 100))) : 0;
            return [unitId, progress] as const;
          })
        );

        const progressMap = new Map(progressEntries);
        const cards: StudentUnitCard[] = scopeUnitsList.flatMap(({ scope, items }) =>
          items.map((unit: TextbookUnitItem) => {
            const key = `${unit.book_version}||${unit.grade}||${unit.semester}||${unit.unit}`;
            return {
              id: key,
              unitCode: unit.unit,
              scopeLabel: `${unit.book_version} · ${unit.grade} · ${unit.semester}`,
              title: (unit.unit_title || '').trim() || unit.unit,
              desc: (unit.unit_desc_short || '').trim() || '暂无单元简介',
              progress: progressMap.get(key) ?? 0,
              locked: !unlockedSet.has(key),
              isSpecial: false,
            };
          })
        );

        setAllUnits(cards);
      } catch (e: any) {
        setAllUnits([]);
        setUnitsError(e?.message || '加载单元失败，请稍后重试。');
      } finally {
        setUnitsLoading(false);
      }
    };
    loadUnits();
  }, [token, user?.id, user?.role, user?.storeName]);

  return (
    <div className="flex w-full">
      {/* Sidebar */}
      <aside className="w-64 fixed left-0 top-20 bottom-0 border-r-0 bg-emerald-50 hidden md:flex flex-col py-6 gap-2 z-40">
        <div className="px-8 mb-6">
          <h2 className="font-headline font-black text-xl text-yellow-600">学习中心</h2>
          <p className="text-xs font-semibold text-emerald-800/60">K-12 英语</p>
        </div>
        <nav className="flex flex-col gap-1 flex-grow">
          <div onClick={() => setActiveTab('dashboard')} className={`${activeTab === 'dashboard' ? 'bg-yellow-400 text-yellow-950 shadow-lg shadow-yellow-400/20' : 'text-emerald-800 hover:bg-emerald-100'} rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-headline font-semibold cursor-pointer transition-all duration-200`}>
            <LayoutDashboard className="w-5 h-5" />
            <span>控制面板</span>
          </div>

          <div onClick={() => setActiveTab('phonetics')} className={`${activeTab === 'phonetics' ? 'bg-yellow-400 text-yellow-950 shadow-lg shadow-yellow-400/20' : 'text-emerald-800 hover:bg-emerald-100'} rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-headline font-semibold cursor-pointer transition-all duration-200`}>
            <Mic2 className="w-5 h-5" />
            <span>音标学习</span>
          </div>
          
          <div className="flex flex-col">
            <div onClick={() => setActiveTab('units')} className={`${activeTab === 'units' ? 'bg-yellow-400 text-yellow-950 shadow-lg shadow-yellow-400/20' : 'text-emerald-800 hover:bg-emerald-100'} rounded-full mx-4 mb-1 flex items-center gap-3 px-4 py-3 font-headline font-semibold cursor-pointer transition-all duration-200`}>
              <Library className="w-5 h-5" />
              <span>单元学习</span>
            </div>
            
            {/* Sub-items for Unit Learning */}
            <div className="flex flex-col ml-12 mr-4 mb-2 border-l-2 border-emerald-200/50 pl-2 gap-1">
              <div onClick={() => setActiveTab('units')} className="text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors">
                <BookOpen className="w-4 h-4" /> 单词闯关
              </div>
              <div onClick={() => setActiveTab('units')} className="text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors">
                <MessageCircle className="w-4 h-4" /> 短语闯关
              </div>
              <div onClick={() => setActiveTab('units')} className="text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors">
                <Library className="w-4 h-4" /> 课文阅读
              </div>
              <div onClick={() => setActiveTab('units')} className="text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors">
                <FileQuestion className="w-4 h-4" /> 单元测试
              </div>
            </div>
          </div>

          <div onClick={() => setActiveTab('word-tests')} className={`${activeTab === 'word-tests' ? 'bg-yellow-400 text-yellow-950 shadow-lg shadow-yellow-400/20' : 'text-emerald-800 hover:bg-emerald-100'} rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-headline font-semibold cursor-pointer transition-all duration-200`}>
            <ClipboardList className="w-5 h-5" />
            <span>单词测试</span>
          </div>

          <div onClick={() => setActiveTab('word-reviews')} className={`${activeTab === 'word-reviews' ? 'bg-yellow-400 text-yellow-950 shadow-lg shadow-yellow-400/20' : 'text-emerald-800 hover:bg-emerald-100'} rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-headline font-semibold cursor-pointer transition-all duration-200`}>
            <BookOpen className="w-5 h-5" />
            <span>单词复习</span>
          </div>

          <div onClick={() => setActiveTab('notebook')} className={`${activeTab === 'notebook' ? 'bg-yellow-400 text-yellow-950 shadow-lg shadow-yellow-400/20' : 'text-emerald-800 hover:bg-emerald-100'} rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-headline font-semibold cursor-pointer transition-all duration-200`}>
            <NotebookPen className="w-5 h-5" />
            <span>错题本</span>
          </div>
        </nav>
        
        <div className="p-4 border-t border-outline-variant/20">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-error-container text-on-error-container rounded-xl font-bold hover:bg-error hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-64 flex-1 p-8 pb-20">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in">
            {/* Hero Header */}
            <header className="relative overflow-hidden rounded-2xl p-12 bg-gradient-to-br from-primary to-primary-dim text-on-primary shadow-lg">
              <div className="relative z-10 max-w-2xl">
                <h1 className="font-headline font-extrabold text-5xl tracking-tight leading-tight">准备好开始今天的学习了吗？</h1>
              </div>
              <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
              <div className="absolute right-10 top-10 opacity-20">
                <BookOpen className="w-32 h-32" />
              </div>
            </header>

            {/* Stats Section */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
                <div className="flex items-center gap-6 mb-6">
                  <div className="w-16 h-16 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                    <Flame className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-on-surface-variant font-medium mb-1">连续打卡</p>
                    <h3 className="text-3xl font-black text-on-surface">12 <span className="text-lg font-bold text-on-surface-variant">天</span></h3>
                  </div>
                  <button 
                    onClick={handleCheckIn}
                    disabled={checkedIn}
                    className={`ml-auto px-4 py-2 rounded-lg font-bold transition-colors ${checkedIn ? 'bg-emerald-500 text-white cursor-default' : 'bg-secondary text-on-secondary hover:bg-secondary-dim'}`}
                  >
                    {checkedIn ? '今日已打卡' : '今日打卡'}
                  </button>
                </div>
                
                {/* Simple Calendar for learning days */}
                <div className="grid grid-cols-7 gap-2 text-center text-xs text-on-surface-variant">
                  {['日', '一', '二', '三', '四', '五', '六'].map(day => <div key={day} className="font-bold">{day}</div>)}
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className={`p-2 rounded-full ${i < 12 || (checkedIn && i + 1 === today) ? 'bg-secondary text-on-secondary font-bold' : 'bg-surface-container-highest'}`}>
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-on-surface-variant font-medium mb-1">已学单词</p>
                    <h3 className="text-3xl font-black text-on-surface">348 <span className="text-lg font-bold text-on-surface-variant">个</span></h3>
                  </div>
                </div>
                <div className="text-right opacity-60">
                  <p className="text-sm font-bold">词汇量稳步提升</p>
                  <p className="text-xs">继续保持！</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'units' && (
          <>
            {unitsError && (
              <div className="mb-6 rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 text-sm font-medium text-error">
                {unitsError}
              </div>
            )}
            {unitsLoading && <div className="mb-6 text-sm text-on-surface-variant">正在加载单元列表...</div>}
            {!unitsLoading && !unitsError && allUnits.length === 0 && (
              <div className="mb-6 rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
                当前暂无可学习单元，请联系老师发布教学任务。
              </div>
            )}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {allUnits.map((unit, index) => (
                <div 
                  key={unit.id} 
                  className={`group relative bg-surface-container-lowest p-8 rounded-xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] transition-all duration-500 overflow-hidden ${unit.isSpecial ? 'md:col-span-2 flex flex-col md:flex-row gap-8' : ''} ${!unit.locked ? 'hover:-translate-y-2 cursor-pointer' : 'opacity-80'}`}
                  onClick={() => !unit.locked && navigate(`/student/unit/${encodeURIComponent(unit.id)}`)}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity ${index === 0 ? 'from-secondary-container/20' : index === 1 ? 'from-primary-container/20' : 'from-tertiary-container/20'}`}></div>
                  
                  <div className="relative z-10 flex-1">
                    <div className="flex justify-between items-start mb-6">
                      <div className={`px-4 py-1.5 rounded-full font-headline font-extrabold text-xs tracking-widest ${index === 0 ? 'bg-secondary-container text-on-secondary-container' : index === 1 ? 'bg-primary-container text-on-primary-container' : unit.isSpecial ? 'bg-secondary text-white uppercase' : 'bg-tertiary-container text-on-tertiary-container'}`}>
                        {unit.unitCode}
                      </div>
                      {unit.locked ? <Lock className="w-5 h-5 text-tertiary/40" /> : index === 0 ? <CheckCircle2 className="w-5 h-5 text-secondary-fixed-dim" /> : <Hourglass className="w-5 h-5 text-primary" />}
                    </div>
                    
                    <h3 className={`font-headline font-extrabold text-2xl text-on-surface mb-2 ${unit.isSpecial ? 'text-4xl' : ''}`}>
                      {unit.title}
                    </h3>
                    <p className={`text-sm font-bold mb-3 ${index === 0 ? 'text-secondary/70' : index === 1 ? 'text-primary/70' : 'text-tertiary/70'}`}>
                      {unit.scopeLabel}
                    </p>
                    <p className="text-on-surface-variant text-sm mb-8 leading-relaxed max-w-md">{unit.desc}</p>
                    
                    {!unit.isSpecial && (
                      <div className={`space-y-2 mb-8 ${unit.locked ? 'opacity-40' : ''}`}>
                        <div className={`flex justify-between text-xs font-bold font-headline ${index === 0 ? 'text-secondary' : index === 1 ? 'text-primary' : 'text-tertiary'}`}>
                          <span>当前进度</span>
                          <span>{unit.progress}%</span>
                        </div>
                        <div className="h-3 w-full bg-surface-container-highest rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${index === 0 ? 'bg-secondary-fixed-dim shadow-[0_0_12px_rgba(130,204,255,0.5)]' : index === 1 ? 'bg-primary-fixed shadow-[0_0_12px_rgba(255,215,9,0.5)]' : 'bg-tertiary-fixed-dim'}`} style={{ width: `${unit.progress}%` }}></div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-outline-variant/10">
                      <div className={`flex items-center gap-2 font-bold text-sm ${unit.locked ? 'text-on-surface-variant' : 'text-emerald-600'}`}>
                        {unit.locked ? <Lock className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                        <span>{unit.locked ? '未解锁' : '已解锁'}</span>
                      </div>
                      <button className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${unit.locked ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed' : index === 0 ? 'bg-secondary text-on-secondary group-hover:scale-110' : 'bg-primary text-on-primary group-hover:scale-110'}`}>
                        {unit.locked ? <Lock className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                      </button>
                    </div>
                  </div>

                  {unit.isSpecial && (
                    <div className="md:w-1/3 flex items-center justify-center relative">
                      <div className="w-48 h-48 bg-secondary-container/30 rounded-full absolute blur-2xl"></div>
                      <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAx7gC-p_JJA-4O5XQ0foi8XXhsXNXolPWsYPP_KDwEsKiEM8AuIwskDqys9xUwaeB30Ipx70vwzBwt4sIJornFu-G0MQ1p7gG7yhAxjXrbv6arkXscJEZotOxKuU3tu2xYWqwsrBNslXpT_WslowjtL0q4Xe84AUg8bCunMdjr6yWeP5YliMrZtsxPVeP0VX-EJJh9XLwWXR5hcKpSAUub1hlTgvZ0NeKsWkLQBwuYAfEffzhQMDsmySvmExYejgHWXHDvwCLF63Vc" alt="Special Unit" className="w-40 h-40 object-contain relative z-10 group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        )}

        {activeTab === 'phonetics' && <PhoneticsView />}
        {activeTab === 'word-tests' && <WordTestView />}
        {activeTab === 'word-reviews' && <WordReviewView />}
        
        {activeTab === 'notebook' && (
          <>
            {/* Error Notebook Promo Card */}
            <section className="max-w-4xl mx-auto">
              <div className="group relative bg-tertiary-container/10 p-12 rounded-2xl border-2 border-dashed border-tertiary/20 flex flex-col justify-center items-center text-center">
                <div className="w-24 h-24 bg-tertiary/10 rounded-full flex items-center justify-center mb-8">
                  <BookOpen className="text-tertiary w-12 h-12" />
                </div>
                <h3 className="font-headline font-bold text-3xl text-on-surface mb-4">错题本</h3>
                <p className="text-on-surface-variant text-lg mb-8 px-4 max-w-md">复习错题，助你不断变强。您有 12 个新项目需要练习。</p>
                <button className="bg-tertiary text-on-tertiary px-8 py-4 rounded-full font-headline font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-tertiary/20">立即练习</button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
