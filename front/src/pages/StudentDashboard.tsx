import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTimer } from '../context/TimerContext';
import { useAuth } from '../context/AuthContext';
import { adminStoreApi, authApi, learningProgressApi, studentCheckInApi, studentLearningStatsApi, StudentCheckInCalendarData, StudentLearningStats, StudentTeacherExamWrongNotebookGroup, StudentWordReviewAssignment, StudentWordTestAssignment, studentTeacherExamApi, unitAssignmentApi, UnitAssignment, wordReviewApi, wordTestApi } from '../lib/auth';
import { getSessionToken } from '../lib/session';
import { getTextbookVersionCandidates, lexiconApi, normalizeTextbookPermissionToAvailable, LexiconItem } from '../lib/lexicon';
import { BookOpen, Play, Lock, CheckCircle2, Hourglass, Flame, LayoutDashboard, Library, NotebookPen, MessageCircle, FileQuestion, LogOut, Mic2, ClipboardList, RotateCcw, MapPinned, BarChart3 } from 'lucide-react';
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
  assignmentId?: number;
  paperId?: number | null;
  paperTitle?: string | null;
};

type UnitScope = {
  bookVersion: string;
  grade: string;
  semester: string;
};

type DashboardProperNoun = {
  word: string;
  meaning: string;
};

type DashboardStatsMode = 'total' | 'today';

function normalizeLegacyTextbookPermission(permission: string, mergedTextbooks: string[]) {
  const p = (permission || '').trim();
  if (!p) return '';
  if (mergedTextbooks.includes(p)) return p;
  const mapping: Record<string, string[]> = {
    PEP: ['RenJiao'],
    FLTRP: ['WaiYan'],
    SHJ: ['ShangHai'],
  };
  const aliases = mapping[p] || [];
  const hit = mergedTextbooks.find((bv) => aliases.includes(bv));
  return hit || p;
}

function getShanghaiTodayParts() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function buildCalendarCells(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < firstDay; i += 1) {
    cells.push({ day: null, key: `empty-start-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, key: `day-${day}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, key: `empty-end-${cells.length}` });
  }
  return cells;
}

function buildProperNounSessionKey(userId: string | number, textbook: string, grade: string) {
  return `student_dashboard_proper_words_${userId}_${textbook}_${grade}`;
}

function pickDashboardProperNouns(candidates: DashboardProperNoun[], limit = 10) {
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}

function resolveDashboardProperNouns(sessionKey: string, candidates: DashboardProperNoun[]) {
  if (!candidates.length) {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {}
    return [];
  }
  try {
    const raw = sessionStorage.getItem(sessionKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(
          (item): item is DashboardProperNoun =>
            item && typeof item.word === 'string' && typeof item.meaning === 'string'
        );
        if (valid.length > 0) {
          return valid;
        }
      }
    }
  } catch {}

  const selected = pickDashboardProperNouns(candidates, 10);
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify(selected));
  } catch {}
  return selected;
}

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { pauseTimer } = useTimer();
  const { logout, user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'units' | 'notebook' | 'phonetics' | 'word-tests' | 'word-reviews'>('dashboard');
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [allUnits, setAllUnits] = useState<StudentUnitCard[]>([]);
  const [checkInData, setCheckInData] = useState<StudentCheckInCalendarData | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [pendingWordTest, setPendingWordTest] = useState<StudentWordTestAssignment | null>(null);
  const [pendingWordReview, setPendingWordReview] = useState<StudentWordReviewAssignment | null>(null);
  const [unitAssignments, setUnitAssignments] = useState<UnitAssignment[]>([]);
  const [teacherWrongNotebook, setTeacherWrongNotebook] = useState<StudentTeacherExamWrongNotebookGroup[]>([]);
  const [teacherWrongNotebookLoading, setTeacherWrongNotebookLoading] = useState(false);
  const [learningStats, setLearningStats] = useState<StudentLearningStats | null>(null);
  const [learningStatsLoading, setLearningStatsLoading] = useState(false);
  const [properNounWords, setProperNounWords] = useState<DashboardProperNoun[]>([]);
  const [properNounIndex, setProperNounIndex] = useState(0);
  const [properNounPaused, setProperNounPaused] = useState(false);
  const [statsMode, setStatsMode] = useState<DashboardStatsMode>('total');
  const [statsPaused, setStatsPaused] = useState(false);
  const shanghaiToday = useMemo(() => getShanghaiTodayParts(), []);
  const calendarCells = useMemo(
    () => buildCalendarCells(checkInData?.year || shanghaiToday.year, checkInData?.month || shanghaiToday.month),
    [checkInData?.month, checkInData?.year, shanghaiToday.month, shanghaiToday.year]
  );
  const checkInDisabled = checkInLoading || checkInSubmitting || Boolean(checkInData?.todayCheckedIn);
  const currentProperNoun = properNounWords[properNounIndex] || null;

  useEffect(() => {
    document.title = '学生控制面板';
  }, []);

  const loadCheckInCalendar = async () => {
    if (!token || !user || user.role !== 'student') return;
    setCheckInLoading(true);
    setCheckInError(null);
    try {
      const payload = await studentCheckInApi.getCalendar(token, shanghaiToday.year, shanghaiToday.month);
      setCheckInData(payload);
    } catch (e: any) {
      setCheckInError(e?.message || '加载打卡日历失败');
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!token || !user || user.role !== 'student' || checkInDisabled) {
      return;
    }
    setCheckInSubmitting(true);
    setCheckInError(null);
    try {
      const payload = await studentCheckInApi.checkInToday(token);
      setCheckInData(payload);
    } catch (e: any) {
      setCheckInError(e?.message || '打卡失败');
    } finally {
      setCheckInSubmitting(false);
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
    loadCheckInCalendar();
  }, [token, user?.id, user?.role]);

  useEffect(() => {
    const loadPendingTasks = async () => {
      if (!token || !user?.id || user.role !== 'student') return;
      try {
        const [testRows, reviewRows] = await Promise.all([
          wordTestApi.getStudentAssignments(token, Number(user.id)).catch(() => []),
          wordReviewApi.getStudentAssignments(token, Number(user.id)).catch(() => []),
        ]);
        setPendingWordTest((testRows || []).find((item) => item.status !== 'completed') || null);
        setPendingWordReview((reviewRows || []).find((item) => item.status !== 'completed') || null);
      } catch {
        setPendingWordTest(null);
        setPendingWordReview(null);
      }
    };
    loadPendingTasks();
  }, [token, user?.id, user?.role]);

  useEffect(() => {
    const loadLearningStats = async () => {
      if (!token || !user?.id || user.role !== 'student') return;
      setLearningStatsLoading(true);
      try {
        const payload = await studentLearningStatsApi.get(token, Number(user.id));
        setLearningStats(payload);
      } catch {
        setLearningStats(null);
      } finally {
        setLearningStatsLoading(false);
      }
    };
    loadLearningStats();
  }, [token, user?.id, user?.role]);

  useEffect(() => {
    if (properNounWords.length <= 1 || properNounPaused) return;
    const timer = window.setInterval(() => {
      setProperNounIndex((prev) => (prev + 1) % properNounWords.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [properNounPaused, properNounWords]);

  useEffect(() => {
    if (properNounIndex >= properNounWords.length) {
      setProperNounIndex(0);
    }
  }, [properNounIndex, properNounWords.length]);

  useEffect(() => {
    if (statsPaused) return;
    const timer = window.setInterval(() => {
      setStatsMode((prev) => (prev === 'total' ? 'today' : 'total'));
    }, 4200);
    return () => window.clearInterval(timer);
  }, [statsPaused]);

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
        const [latestUser, stores, assignments, textbookScopes] = await Promise.all([
          authApi.getCurrentUser(token),
          adminStoreApi.getAllStores(token),
          unitAssignmentApi.getByStudent(token, Number(user.id)),
          lexiconApi.getTextbookScopes(token),
        ]);

        const studentTextbook = ((latestUser as any).textbookVersion || '').trim();
        const studentGrade = ((latestUser as any).grade || '').trim();
        const storeCode = ((latestUser as any).storeName || user.storeName || '').trim();
        if (!studentTextbook || !studentGrade) {
          setAllUnits([]);
          setUnitsError('未找到当前学生的教材或年级信息');
          return;
        }

        const store = stores.find((s) => s.storeCode === storeCode);
        const scopeTree = textbookScopes.tree || [];
        const mergedTextbooks = Array.from(new Set(scopeTree.map((b) => b.bookVersion).filter(Boolean)));
        const allowedTextbooksRaw = (store?.textbookPermissions || [])
          .map((p) => normalizeTextbookPermissionToAvailable(p, mergedTextbooks))
          .filter(Boolean);
        const hasStorePermission = Boolean(store && allowedTextbooksRaw.length > 0);
        const studentTextbookCandidates = getTextbookVersionCandidates(studentTextbook);

        setUnitAssignments(assignments || []);
        const assignmentMap = new Map(
          (assignments || []).map((a) => [`${a.textbookVersion}||${a.grade}||${a.semester}||${a.unitName}`, a] as const)
        );
        const unlockedSet = new Set(Array.from(assignmentMap.keys()));

        // 浠庢暀鏉愯寖鍥翠腑鎵惧埌瀛︾敓鍙闂殑鑼冨洿
        const unitScopes: UnitScope[] = [];
        scopeTree.forEach((book) => {
          if (!studentTextbookCandidates.includes(book.bookVersion)) return;
          if (hasStorePermission && !allowedTextbooksRaw.includes(book.bookVersion)) return;
          (book.grades || []).forEach((gradeNode) => {
            if (gradeNode.grade !== studentGrade) return;
            (gradeNode.semesters || []).forEach((semester) => {
              unitScopes.push({
                bookVersion: book.bookVersion,
                grade: gradeNode.grade,
                semester,
              });
            });
          });
        });

        const uniqueScopes = Array.from(
          new Map(unitScopes.map((scope) => [`${scope.bookVersion}||${scope.grade}||${scope.semester}`, scope])).values()
        );

        // 瀵规瘡涓寖鍥达紝鏌ヨ鍗曡瘝鏉ヨ幏鍙栧崟鍏冨垪琛?
        const scopeUnitsList = await Promise.all(
          uniqueScopes.map(async (scope) => {
            try {
              const wordItems = await lexiconApi.getItems(token, 'word', scope.bookVersion, scope.grade, scope.semester);
              const units = Array.from(new Set(wordItems.items.map((item) => item.unit).filter(Boolean)));
              return {
                scope,
                units,
                items: wordItems.items || [],
              };
            } catch {
              return {
                scope,
                units: [],
                items: [] as LexiconItem[],
              };
            }
          })
        );

        const properNounCandidates = Array.from(
          new Map(
            scopeUnitsList
              .flatMap((scopeRow) => scopeRow.items)
              .filter((item) => ['place', 'country_region'].includes((item.proper_noun_type || '').trim()))
              .map((item) => {
                const word = (item.word || '').trim();
                const meaning = (item.meanings?.[0]?.meaning || '').trim();
                return [word.toLowerCase(), { word, meaning }] as const;
              })
              .filter((entry) => entry[1].word && entry[1].meaning)
          ).values()
        );
        const sessionKey = buildProperNounSessionKey(user.id, studentTextbook, studentGrade);
        const sessionWords = resolveDashboardProperNouns(sessionKey, properNounCandidates);
        setProperNounWords(sessionWords);
        setProperNounIndex(0);

        const unlockedUnits = new Set(
          scopeUnitsList
            .flatMap((scopeRow) => scopeRow.units.map((unit) => `${scopeRow.scope.bookVersion}||${scopeRow.scope.grade}||${scopeRow.scope.semester}||${unit}`))
            .filter((key) => unlockedSet.has(key))
        );

        const progressEntries = await Promise.all(
          Array.from(unlockedUnits).map(async (unitId) => {
            const [bookVersion, grade, semester, unitName] = unitId.split('||');
            const [wordSummary, phraseSummary, allPassages, readingRows] = await Promise.all([
              lexiconApi.getLearningSummary(token, { type: 'word', bookVersion, grade, semester, unit: unitName }).catch(() => null),
              lexiconApi.getLearningSummary(token, { type: 'phrase', bookVersion, grade, semester, unit: unitName }).catch(() => null),
              lexiconApi.getPassages(token, bookVersion, grade, semester).catch(() => ({ items: [] as any[] })),
              learningProgressApi.getGroupProgress(token, Number(user.id), unitId, 'reading').catch(() => []),
            ]);
            const [vocabRows, phraseRows] = await Promise.all([
              Promise.all(
                ((([] as any[]).concat((wordSummary as any)?.sourceGroups || [])) as Array<{ sourceTag: string }>)
                  .map((row) => learningProgressApi.getGroupProgress(token, Number(user.id), `${unitId}||${row.sourceTag}`, 'vocab').catch(() => []))
              ).catch(() => []),
              Promise.all(
                ((([] as any[]).concat((phraseSummary as any)?.sourceGroups || [])) as Array<{ sourceTag: string }>)
                  .map((row) => learningProgressApi.getGroupProgress(token, Number(user.id), `${unitId}||${row.sourceTag}`, 'phrase').catch(() => []))
              ).catch(() => []),
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

            const wordLearned = Math.min(wordTotal, calcLearned((vocabRows as any[]).flat?.() || []));
            const phraseLearned = Math.min(phraseTotal, calcLearned((phraseRows as any[]).flat?.() || []));
            const readingLearned = Math.min(readingTotal, calcLearned(readingRows as any[]));

            const total = wordTotal + phraseTotal + readingTotal;
            const learned = wordLearned + phraseLearned + readingLearned;
            const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((learned / total) * 100))) : 0;
            return [unitId, progress] as const;
          })
        );

        const progressMap = new Map(progressEntries);
        const cards: StudentUnitCard[] = scopeUnitsList.flatMap(({ scope, units }) =>
          units.map((unit: string) => {
            const key = `${scope.bookVersion}||${scope.grade}||${scope.semester}||${unit}`;
            return {
              id: key,
              unitCode: unit,
              scopeLabel: `${scope.bookVersion} · ${scope.grade} · ${scope.semester}`,
              title: unit,
              desc: '单元学习任务',
              progress: progressMap.get(key) ?? 0,
              locked: !unlockedSet.has(key),
              isSpecial: false,
              assignmentId: assignmentMap.get(key)?.id,
              paperId: assignmentMap.get(key)?.paperId,
              paperTitle: assignmentMap.get(key)?.paperTitle,
            };
          })
        );

        const assignmentOnlyCards: StudentUnitCard[] = Array.from(unlockedSet)
          .filter((key) => !cards.some((card) => card.id === key))
          .map((key) => {
            const [bookVersion, grade, semester, unitName] = key.split('||');
            return {
              id: key,
              unitCode: unitName,
              scopeLabel: `${bookVersion} · ${grade} · ${semester}`,
              title: unitName,
              desc: '该单元已解锁，可以直接开始学习。',
              progress: progressMap.get(key) ?? 0,
              locked: false,
              isSpecial: false,
              assignmentId: assignmentMap.get(key)?.id,
              paperId: assignmentMap.get(key)?.paperId,
              paperTitle: assignmentMap.get(key)?.paperTitle,
            };
          });

        setAllUnits([...cards, ...assignmentOnlyCards]);
      } catch (e: any) {
        setAllUnits([]);
        setProperNounWords([]);
        setProperNounIndex(0);
        setUnitsError(e?.message || '加载单元失败');
      } finally {
        setUnitsLoading(false);
      }
    };
    loadUnits();
  }, [token, user?.id, user?.role, user?.storeName]);

  useEffect(() => {
    const loadNotebook = async () => {
      if (!token || !user?.id || activeTab !== 'notebook') return;
      setTeacherWrongNotebookLoading(true);
      try {
        const payload = await studentTeacherExamApi.getWrongNotebook(token, Number(user.id));
        setTeacherWrongNotebook(payload || []);
      } catch {
        setTeacherWrongNotebook([]);
      } finally {
        setTeacherWrongNotebookLoading(false);
      }
    };
    loadNotebook();
  }, [activeTab, token, user?.id]);

  const unlockedUnits = useMemo(
    () => allUnits.filter((unit) => !unit.locked),
    [allUnits]
  );
  const lockedUnits = useMemo(
    () => allUnits.filter((unit) => unit.locked),
    [allUnits]
  );
  const pendingUnitCard = useMemo(
    () => unlockedUnits[0] || null,
    [unlockedUnits]
  );
  const pendingTeacherPaperAssignment = useMemo(
    () => unitAssignments.find((row) => typeof row.paperId === 'number' && row.paperId > 0) || null,
    [unitAssignments]
  );
  const openPendingTeacherPaper = () => {
    if (pendingTeacherPaperAssignment?.id) {
      navigate(`/student/unit-test/${pendingTeacherPaperAssignment.id}`);
      return;
    }
    setActiveTab('units');
  };
  const dashboardTasks = useMemo(() => {
    const tasks: Array<{
      id: string;
      eyebrow: string;
      title: string;
      subtitle: string;
      desc: string;
      progress: number;
      statusLabel: string;
      actionLabel: string;
      icon: 'unit' | 'test' | 'review';
      onClick: () => void;
    }> = [];
    if (pendingUnitCard) {
      tasks.push({
        id: `dashboard-unit-${pendingUnitCard.id}`,
        eyebrow: '单元学习',
        title: pendingUnitCard.title,
        subtitle: pendingUnitCard.scopeLabel,
        desc: '继续已解锁的单元学习任务。',
        progress: pendingUnitCard.progress,
        statusLabel: '待学习',
        actionLabel: '进入单元',
        icon: 'unit',
        onClick: () => navigate(`/student/unit/${encodeURIComponent(pendingUnitCard.id)}`),
      });
    }
    if (pendingWordTest) {
      const testItems = Array.isArray(pendingWordTest.items) ? pendingWordTest.items : [];
      const total = typeof pendingWordTest.totalCount === 'number' && pendingWordTest.totalCount > 0
        ? pendingWordTest.totalCount
        : testItems.length;
      const correct = typeof pendingWordTest.correctCount === 'number' && pendingWordTest.correctCount > 0
        ? pendingWordTest.correctCount
        : 0;
      const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((correct / total) * 100))) : 0;
      tasks.push({
        id: `dashboard-test-${pendingWordTest.assignmentId}`,
        eyebrow: '单词测试',
        title: pendingWordTest.title,
        subtitle: `${pendingWordTest.testType} · ${total} 个单词`,
        desc: `待完成单词测试，合格分 ${typeof pendingWordTest.passScore === 'number' ? pendingWordTest.passScore : 60} 分`,
        progress,
        statusLabel: '待完成',
        actionLabel: '去做测试',
        icon: 'test',
        onClick: () => setActiveTab('word-tests'),
      });
    }
    if (pendingWordReview) {
      const total = Math.max(0, pendingWordReview.totalWordCount || 0);
      const mastered = Math.max(0, pendingWordReview.masteredWordCount || 0);
      const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((mastered / total) * 100))) : 0;
      tasks.push({
        id: `dashboard-review-${pendingWordReview.assignmentId}`,
        eyebrow: '单词复习',
        title: pendingWordReview.title,
        subtitle: `每日 ${pendingWordReview.dailyQuota} 个 · 已掌握 ${mastered}/${total}`,
        desc: `今日目标 ${pendingWordReview.dailyQuota} 个单词${pendingWordReview.enableSpelling ? ' + 拼写' : ''}${pendingWordReview.enableZhToEn ? ' + 中译英' : ''}`,
        progress,
        statusLabel: '待完成',
        actionLabel: '去复习',
        icon: 'review',
        onClick: () => setActiveTab('word-reviews'),
      });
    }
    if (pendingTeacherPaperAssignment?.id) {
      tasks.push({
        id: `dashboard-teacher-paper-${pendingTeacherPaperAssignment.id}`,
        eyebrow: '单元测试',
        title: pendingTeacherPaperAssignment.paperTitle || `${pendingTeacherPaperAssignment.unitName} 单元测试`,
        subtitle: `${pendingTeacherPaperAssignment.textbookVersion} · ${pendingTeacherPaperAssignment.grade} · ${pendingTeacherPaperAssignment.semester}`,
        desc: '教师已发布单元测试试卷，提交后会即时显示答案、解析和正误。',
        progress: 0,
        statusLabel: '待完成',
        actionLabel: '开始测试',
        icon: 'test',
        onClick: openPendingTeacherPaper,
      });
    }
    return tasks;
  }, [openPendingTeacherPaper, pendingTeacherPaperAssignment, pendingUnitCard, pendingWordReview, pendingWordTest]);

  const statsTitle = statsMode === 'total' ? '总完成' : '今日完成';
  const statsSubtitle = statsMode === 'total' ? '累计学习成果' : '今日新增成果';
  const statsItems = [
    {
      label: '单词',
      value: statsMode === 'total' ? learningStats?.totalWordsCompleted ?? 0 : learningStats?.todayWordsCompleted ?? 0,
    },
    {
      label: '短语',
      value: statsMode === 'total' ? learningStats?.totalPhrasesCompleted ?? 0 : learningStats?.todayPhrasesCompleted ?? 0,
    },
    {
      label: '课文',
      value: statsMode === 'total' ? learningStats?.totalPassagesCompleted ?? 0 : learningStats?.todayPassagesCompleted ?? 0,
    },
    {
      label: '单词复习',
      value: statsMode === 'total' ? learningStats?.totalReviewWordsCompleted ?? 0 : learningStats?.todayReviewWordsCompleted ?? 0,
    },
  ];

  const renderUnitGrid = (units: StudentUnitCard[]) => (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {units.map((unit, index) => (
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
                  <span>学习进度</span>
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
              <div className="flex items-center gap-2">
                {!unit.locked && unit.assignmentId && unit.paperId ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/student/unit-test/${unit.assignmentId}`);
                    }}
                    className="rounded-full bg-amber-100 px-4 py-2 text-xs font-black text-amber-700 transition hover:scale-105"
                  >
                    单元测试
                  </button>
                ) : null}
                <button className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${unit.locked ? 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed' : index === 0 ? 'bg-secondary text-on-secondary group-hover:scale-110' : 'bg-primary text-on-primary group-hover:scale-110'}`}>
                  {unit.locked ? <Lock className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                </button>
              </div>
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
  );

  const renderDashboardTaskCard = (
    task: {
      id: string;
      eyebrow: string;
      title: string;
      subtitle: string;
      desc: string;
      progress: number;
      statusLabel: string;
      actionLabel: string;
      icon: 'unit' | 'test' | 'review';
      onClick: () => void;
    },
    index: number
  ) => {
    const topTone = index === 0 ? 'from-secondary-container/20' : index === 1 ? 'from-primary-container/20' : 'from-tertiary-container/20';
    const badgeTone = index === 0 ? 'bg-secondary-container text-on-secondary-container' : index === 1 ? 'bg-primary-container text-on-primary-container' : 'bg-tertiary-container text-on-tertiary-container';
    const textTone = index === 0 ? 'text-secondary/70' : index === 1 ? 'text-primary/70' : 'text-tertiary/70';
    const progressTone = index === 0 ? 'bg-secondary-fixed-dim shadow-[0_0_12px_rgba(130,204,255,0.5)]' : index === 1 ? 'bg-primary-fixed shadow-[0_0_12px_rgba(255,215,9,0.5)]' : 'bg-tertiary-fixed-dim';
    const actionTone = index === 0 ? 'bg-secondary text-on-secondary' : 'bg-primary text-on-primary';
    const iconNode = task.icon === 'unit'
      ? <Library className="w-5 h-5 text-secondary-fixed-dim" />
      : task.icon === 'test'
        ? <ClipboardList className="w-5 h-5 text-primary" />
        : <RotateCcw className="w-5 h-5 text-tertiary" />;
    return (
      <div
        key={task.id}
        className="group relative cursor-pointer overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] transition-all duration-500 hover:-translate-y-2"
        onClick={task.onClick}
      >
        <div className={`absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-100 ${topTone}`}></div>
        <div className="relative z-10 flex-1">
          <div className="mb-6 flex items-start justify-between">
            <div className={`rounded-full px-4 py-1.5 text-xs font-headline font-extrabold tracking-widest ${badgeTone}`}>
              {task.eyebrow}
            </div>
            {iconNode}
          </div>
          <h3 className="mb-2 font-headline text-2xl font-extrabold text-on-surface">{task.title}</h3>
          <p className={`mb-3 text-sm font-bold ${textTone}`}>{task.subtitle}</p>
          <p className="mb-8 max-w-md text-sm leading-relaxed text-on-surface-variant">{task.desc}</p>
          <div className="mb-8 space-y-2">
            <div className={`flex justify-between text-xs font-bold font-headline ${textTone}`}>
              <span>学习进度</span>
              <span>{task.progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div className={`h-full rounded-full ${progressTone}`} style={{ width: `${task.progress}%` }}></div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-outline-variant/10 pt-4">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
              <BookOpen className="w-4 h-4" />
              <span>{task.statusLabel}</span>
            </div>
            <button className={`flex h-10 min-w-10 items-center justify-center rounded-full px-4 transition-transform group-hover:scale-110 ${actionTone}`}>
              <span className="text-sm font-bold">{task.actionLabel}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex w-full">
      {/* Sidebar */}
      <aside className="w-64 fixed left-0 top-20 bottom-0 border-r-0 bg-emerald-50 hidden md:flex flex-col py-6 gap-2 z-40">
        <div className="px-8 mb-6">
          <h2 className='font-headline font-black text-xl text-yellow-600'>学生学习</h2>
          <p className='text-xs font-semibold text-emerald-800/60'>K-12 英语</p>
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
                <BookOpen className='w-4 h-4' /> 单词学习
              </div>
              <div onClick={() => setActiveTab('units')} className="text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors">
                <MessageCircle className='w-4 h-4' /> 短语学习
              </div>
              <div onClick={() => setActiveTab('units')} className="text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors">
                <Library className='w-4 h-4' /> 课文学习
              </div>
              <div onClick={() => setActiveTab('units')} className="text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-100/50 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2 transition-colors">
                <FileQuestion className='w-4 h-4' /> 单元测试
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
                <h1 className='font-headline font-extrabold text-5xl tracking-tight leading-tight'>准备开始今天的学习了吗？</h1>
              </div>
              <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
              <div className="absolute right-10 top-10 opacity-20">
                <BookOpen className="w-32 h-32" />
              </div>
            </header>

            {/* Stats Section */}
            <section className='grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.22fr)_minmax(360px,0.78fr)]'>
              <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
                <div className="flex items-center gap-6 mb-6">
                  <div className="w-16 h-16 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                    <Flame className="w-8 h-8" />
                  </div>
                  <div>
                    <p className='text-on-surface-variant font-medium mb-1'>连续打卡</p>
                    <h3 className='text-3xl font-black text-on-surface'>{checkInData?.streakDays ?? 0} <span className='text-lg font-bold text-on-surface-variant'>天</span></h3>
                  </div>
                  <button 
                    onClick={handleCheckIn}
                    disabled={checkInDisabled}
                    className={`ml-auto px-4 py-2 rounded-lg font-bold transition-colors ${checkInDisabled ? 'bg-emerald-500 text-white cursor-default' : 'bg-secondary text-on-secondary hover:bg-secondary-dim'}`}
                  >
                    {checkInSubmitting ? '正在打卡...' : checkInData?.todayCheckedIn ? '今日已打卡' : '今日打卡'}
                  </button>
                </div>
                <div className="mb-4 flex items-center justify-between text-sm">
                  <span className='font-bold text-on-surface'>{(checkInData?.year || shanghaiToday.year)} 年 {(checkInData?.month || shanghaiToday.month)} 月</span>
                  {checkInLoading && <span className='text-on-surface-variant'>正在加载...</span>}
                </div>
                {checkInError && (
                  <div className="mb-4 rounded-lg border border-error/30 bg-error-container/20 px-3 py-2 text-sm text-error">
                    {checkInError}
                  </div>
                )}
                
                <div className="grid grid-cols-7 gap-2 text-center text-xs text-on-surface-variant">
                  {['日', '一', '二', '三', '四', '五', '六'].map(day => <div key={day} className='font-bold'>{day}</div>)}
                  {calendarCells.map((cell) => {
                    const isToday = cell.day != null
                      && (checkInData?.year || shanghaiToday.year) === shanghaiToday.year
                      && (checkInData?.month || shanghaiToday.month) === shanghaiToday.month
                      && cell.day === shanghaiToday.day;
                    const isCheckedIn = cell.day != null && (checkInData?.checkedInDates || []).includes(cell.day);
                    return (
                    <div key={cell.key} className={`p-2 rounded-full min-h-9 flex items-center justify-center ${cell.day == null ? 'bg-transparent' : isCheckedIn ? 'bg-secondary text-on-secondary font-bold' : isToday ? 'bg-secondary-container text-on-secondary-container font-bold' : 'bg-surface-container-highest'}`}>
                      {cell.day ?? ''}
                    </div>
                  )})}
                </div>
              </div>
              
              <div className="flex h-full flex-col gap-6">
                <section
                  className='flex min-h-[172px] w-full flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm'
                  onMouseEnter={() => setProperNounPaused(true)}
                  onMouseLeave={() => setProperNounPaused(false)}
                >
                  <div>
                    <p className='mb-4 text-sm font-semibold text-on-surface-variant'>专有名词</p>
                    {currentProperNoun ? (
                      <>
                        <div className='flex items-center gap-3 overflow-hidden'>
                          <h3 className='truncate text-2xl font-headline font-black text-on-surface'>{currentProperNoun.word}</h3>
                          <p className='truncate text-base font-bold text-on-surface-variant'>{currentProperNoun.meaning}</p>
                        </div>
                      </>
                    ) : (
                      <div className='pt-8 text-sm text-on-surface-variant'>暂无可展示单词</div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-4">
                    {properNounWords.slice(0, 10).map((item, index) => (
                      <button
                        key={`${item.word}-${index}`}
                        type="button"
                        className={`h-2.5 rounded-full transition-all ${index === properNounIndex ? 'w-6 bg-tertiary' : 'w-2.5 bg-outline-variant/60'}`}
                        onClick={() => setProperNounIndex(index)}
                        aria-label={`切换到第 ${index + 1} 个单词`}
                      />
                    ))}
                  </div>
                </section>

                <section
                  className='flex min-h-[268px] w-full flex-[1.35] flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm'
                  onMouseEnter={() => setStatsPaused(true)}
                  onMouseLeave={() => setStatsPaused(false)}
                >
                  <div className="mb-4">
                    <p className='text-sm font-semibold text-on-surface-variant'>学习统计</p>
                    <h3 className="mt-1 text-xl font-headline font-black text-on-surface">{statsTitle}</h3>
                  </div>
                  {learningStatsLoading ? (
                    <div className='flex flex-1 items-center justify-center text-sm text-on-surface-variant'>正在加载统计...</div>
                  ) : (
                    <div className="grid flex-1 grid-cols-2 gap-3">
                      {statsItems.map((item, index) => (
                        <div
                          key={item.label}
                          className={`rounded-2xl border p-4 ${index % 2 === 0 ? 'border-secondary-container/60 bg-secondary-container/20' : 'border-primary-container/60 bg-primary-container/20'}`}
                        >
                          <p className="mb-2 text-sm font-semibold text-on-surface-variant">{item.label}</p>
                          <h4 className="text-3xl font-black text-on-surface">{item.value}</h4>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

              </div>
            </section>


            <section className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className='mt-1 text-2xl font-headline font-black text-on-surface'>待完成任务</h2>
                  {/* 淇濇寔鑻辨枃鐪夋爣锛屼富鏍囬浣跨敤涓枃 */}
                  <h2 className="mt-1 text-2xl font-headline font-black text-on-surface">待完成任务</h2>
                </div>
                <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
                  {dashboardTasks.length} 项
                </div>
              </div>
              {dashboardTasks.length === 0 ? (
                <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest px-6 py-10 text-center text-on-surface-variant shadow-sm">
                  当前没有待完成任务
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
                  {dashboardTasks.map((task, index) => renderDashboardTaskCard(task, index))}
                </div>
              )}
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
            {unitsLoading && <div className='mb-6 text-sm text-on-surface-variant'>正在加载单元...</div>}
            {!unitsLoading && !unitsError && allUnits.length === 0 && (
              <div className="mb-6 rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
                当前没有可学习的单元，请联系老师分配任务。              </div>
            )}
            {!unitsLoading && !unitsError && unlockedUnits.length > 0 && (
              <section className="mb-10">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className='text-xs font-black uppercase tracking-[0.28em] text-emerald-500'>Unlocked</p>
                    <h2 className='mt-1 text-2xl font-headline font-black text-on-surface'>已解锁单元</h2>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
                      {unlockedUnits.length} 个
                </div>
                </div>
                {renderUnitGrid(unlockedUnits)}
              </section>
            )}
            {!unitsLoading && !unitsError && lockedUnits.length > 0 && (
              <section>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className='text-xs font-black uppercase tracking-[0.28em] text-amber-600'>Locked</p>
                    <h2 className='mt-1 text-2xl font-headline font-black text-on-surface'>待解锁单元</h2>
                  </div>
                  <div className="rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
                      {lockedUnits.length} 个
                </div>
                </div>
                {renderUnitGrid(lockedUnits)}
              </section>
            )}
          </>
        )}

        {activeTab === 'phonetics' && <PhoneticsView />}
        {activeTab === 'word-tests' && <WordTestView />}
        {activeTab === 'word-reviews' && <WordReviewView />}

        {activeTab === 'notebook' && (
          <section className="mx-auto max-w-5xl space-y-6">
            <div className="rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
              <h3 className='font-headline font-bold text-3xl text-on-surface mb-3'>教师试卷错题本</h3>
              <p className='text-on-surface-variant'>按题目来源分组，保留材料、答案、解析和你的作答记录。</p>
            </div>

            {teacherWrongNotebookLoading && (
              <div className="rounded-2xl bg-surface-container-lowest p-6 text-sm text-on-surface-variant shadow-sm">
                正在加载错题本...
              </div>
            )}

            {!teacherWrongNotebookLoading && teacherWrongNotebook.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-tertiary/20 bg-tertiary-container/10 p-10 text-center shadow-sm">
                <div className="mb-4 text-lg font-bold text-on-surface">当前还没有教师试卷错题</div>
                <p className="text-sm text-on-surface-variant">完成教师发布的单元测试后，答错的题目会自动进入这里。</p>
              </div>
            )}

            {!teacherWrongNotebookLoading && teacherWrongNotebook.map((group) => (
              <div key={group.sourceKey} className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
                <div className="mb-4">
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-primary">Source</div>
                  <h4 className="mt-2 text-xl font-black text-on-surface">{group.sourceLabel}</h4>
                </div>
                <div className="space-y-4">
                  {group.items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-outline-variant/20 bg-white p-5">
                      <div className="mb-2 text-sm font-bold text-on-surface">{item.sectionTitle} · {item.questionType}</div>
                      <div className="mb-2 text-xs text-on-surface-variant">{[item.bookVersion, item.grade, item.semester, item.unitCode].filter(Boolean).join(' / ')}</div>
                      {item.sharedStem && <div className="mb-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">{item.sharedStem}</div>}
                      {item.material && <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-7 text-slate-700">{item.material}</div>}
                      <div className="text-sm font-bold leading-7 text-slate-900">{item.stem}</div>
                      {Array.isArray(item.options) && item.options.length > 0 && (
                        <div className="mt-3 space-y-1 text-sm leading-7 text-slate-700">
                          {item.options.map((option: any, index: number) => (
                            <div key={`${item.id}-${index}`}>{option.key}. {option.text}</div>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                        <div>你的答案：{Array.isArray(item.submittedAnswer) ? item.submittedAnswer.join(', ') : String(item.submittedAnswer ?? '-')}</div>
                        <div>正确答案：{Array.isArray(item.correctAnswer) ? item.correctAnswer.join(', ') : String(item.correctAnswer ?? '-')}</div>
                        <div>解析：{item.analysis || '-'}</div>
                        <div>错误次数：{item.wrongCount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
        
        {activeTab === 'notebook' && false && (
          <>
            {/* Error Notebook Promo Card */}
            <section className="max-w-4xl mx-auto">
              <div className="group relative bg-tertiary-container/10 p-12 rounded-2xl border-2 border-dashed border-tertiary/20 flex flex-col justify-center items-center text-center">
                <div className="w-24 h-24 bg-tertiary/10 rounded-full flex items-center justify-center mb-8">
                  <BookOpen className="text-tertiary w-12 h-12" />
                </div>
                <h3 className='font-headline font-bold text-3xl text-on-surface mb-4'>错题本</h3>
                <p className='text-on-surface-variant text-lg mb-8 px-4 max-w-md'>复习做错的题目，帮助你巩固薄弱点。</p>
                <button className='bg-tertiary text-on-tertiary px-8 py-4 rounded-full font-headline font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-tertiary/20'>立即练习</button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
