import React, { useEffect, useMemo, useState } from 'react';
import { Volume2, Play, CheckCircle2, XCircle, Award, BookOpen, Clock3, RotateCcw, ClipboardList, Hourglass } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StudentWordTestAssignment, WordTestContentItem, wordTestApi } from '../../lib/auth';
import { lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

function normalizeAnswer(value: string) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function shuffleItems(items: WordTestContentItem[]): WordTestContentItem[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatDuration(seconds?: number | null) {
  if (typeof seconds !== 'number' || seconds <= 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}

export const WordTestView: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [tests, setTests] = useState<StudentWordTestAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTest, setActiveTest] = useState<StudentWordTestAssignment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const loadAssignments = async () => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await wordTestApi.getStudentAssignments(token, Number(user.id));
      setTests(rows || []);
    } catch (e: any) {
      setError(e?.message || '加载单词测试失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, [token, user?.id]);

  const pendingTests = tests.filter((t) => t.status !== 'completed');
  const completedTests = tests.filter((t) => t.status === 'completed');

  const handleStartTest = (test: StudentWordTestAssignment) => {
    const safeItems = Array.isArray(test.items) ? test.items : [];
    setActiveTest({ ...test, items: shuffleItems(safeItems) });
    setAnswers({});
    setStartedAt(Date.now());
    setSubmitted(false);
    setScore(0);
    setCorrectCount(0);
  };

  const handleInputChange = (wordId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [wordId]: value }));
  };

  const handleBackFromTest = () => {
    if (!submitted) {
      const confirmed = window.confirm('当前测试尚未提交，返回后本次作答不会保存。确认返回吗？');
      if (!confirmed) return;
    }
    setActiveTest(null);
    setAnswers({});
    setStartedAt(null);
    setSubmitting(false);
    setSubmitted(false);
    setScore(0);
    setCorrectCount(0);
  };

  const handleSubmit = async () => {
    if (!activeTest || !token || !startedAt) return;
    const activeItems = Array.isArray(activeTest.items) ? activeTest.items : [];
    const total = activeItems.length;
    if (total === 0) return;

    let correct = 0;
    const payloadAnswers = activeItems.map((item) => {
      const input = answers[item.entryId] || '';
      const ok = normalizeAnswer(input) === normalizeAnswer(item.word || '');
      if (ok) correct += 1;
      return {
        wordId: item.entryId,
        input,
        isCorrect: ok,
      };
    });

    const finalScore = Math.round((correct * 100) / total);
    const duration = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));

    setSubmitting(true);
    setError(null);
    try {
      await wordTestApi.submitAssignment(token, activeTest.assignmentId, {
        answers: payloadAnswers,
        score: finalScore,
        duration,
        correctCount: correct,
        totalCount: total,
      });
      setScore(finalScore);
      setCorrectCount(correct);
      setSubmitted(true);
      await loadAssignments();
    } catch (e: any) {
      setError(e?.message || '提交测试失败');
    } finally {
      setSubmitting(false);
    }
  };

  const playAudio = async (audioPath?: string) => {
    if (!audioPath || !token) return;
    try {
      await lexiconApi.playAudioWithAuth(token, audioPath);
    } catch {
      setError('音频播放失败');
    }
  };

  const renderTestCard = (test: StudentWordTestAssignment, completed: boolean) => {
    const testItems = Array.isArray(test.items) ? test.items : [];
    const passScore = typeof test.passScore === 'number' ? test.passScore : 60;
    const bestScore = typeof test.score === 'number' ? test.score : null;
    const attemptCount = typeof test.attemptCount === 'number' ? test.attemptCount : 0;
    const bestDuration = formatDuration(test.duration);
    const total = typeof test.totalCount === 'number' && test.totalCount > 0 ? test.totalCount : testItems.length;
    const correct = typeof test.correctCount === 'number' && test.correctCount > 0 ? test.correctCount : 0;
    const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((correct / total) * 100))) : completed ? 100 : 0;

    return (
      <div key={test.assignmentId} className="group relative flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] transition-all duration-500 hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-container/15 opacity-0 transition-opacity group-hover:opacity-100"></div>
        <div className="relative z-10 flex flex-1 flex-col">
          <div className="mb-6 flex items-start justify-between gap-2">
            <div className="rounded-full bg-primary-container px-4 py-1.5 text-xs font-headline font-extrabold tracking-widest text-on-primary-container">
            单词测试
            </div>
            {completed ? <CheckCircle2 className="h-5 w-5 text-secondary-fixed-dim" /> : <Hourglass className="h-5 w-5 text-primary" />}
          </div>

          <h3 className="mb-2 font-headline text-2xl font-extrabold text-on-surface">{test.title}</h3>
          <p className="mb-3 text-sm font-bold text-primary/70">{test.testType} · {completed ? '已完成任务' : '待完成任务'}</p>
          <p className="mb-6 text-sm leading-relaxed text-on-surface-variant">
            {test.items.length} 个单词 · 合格分 {passScore} 分 · 累计完成 {attemptCount} 次
          </p>

          <div className="mb-4 grid grid-cols-2 gap-3 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1"><BookOpen className="w-4 h-4" /> {test.items.length} 个单词</span>
            <span>{completed ? '当前状态：已完成' : '当前状态：待完成'}</span>
            <span>最高分：{bestScore === null ? '-' : `${bestScore} 分`}</span>
            <span className="flex items-center gap-1"><Clock3 className="w-4 h-4" /> 最佳用时：{bestDuration}</span>
          </div>

          <div className="mb-8 space-y-2">
            <div className="flex justify-between text-xs font-bold font-headline text-primary">
              <span>当前进度</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div className="h-full rounded-full bg-primary-fixed shadow-[0_0_12px_rgba(255,215,9,0.5)]" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-outline-variant/10 pt-4">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-600">
              <ClipboardList className="w-4 h-4" />
              <span>{completed ? '可再次练习' : '等待开始测试'}</span>
            </div>
            <button
              onClick={() => handleStartTest(test)}
              className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 font-bold text-on-primary transition-transform group-hover:scale-110"
            >
              {completed ? <RotateCcw className="w-5 h-5" /> : <Play className="w-5 h-5" />} {completed ? '重新测试' : '开始测试'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (activeTest) {
    const activeItems = Array.isArray(activeTest.items) ? activeTest.items : [];
    const total = activeItems.length;
    const passScore = typeof activeTest.passScore === 'number' ? activeTest.passScore : 60;
    return (
      <div className="space-y-8 animate-in fade-in">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-between items-center bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant/20">
          <div>
            <h2 className="text-2xl font-black text-on-surface">{activeTest.title}</h2>
            <p className="text-on-surface-variant mt-1">
              测试类型: <span className="font-bold text-primary">{activeTest.testType}</span> · 合格分: <span className="font-bold text-primary">{passScore}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackFromTest}
              className="px-8 py-3 bg-surface-container-highest text-on-surface font-bold rounded-full hover:bg-surface-variant transition-colors"
            >
              返回
            </button>
            {!submitted && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-8 py-3 bg-primary text-on-primary font-bold rounded-full shadow-md hover:bg-primary-dim transition-colors disabled:opacity-50"
              >
                {submitting ? '提交中...' : '提交试卷'}
              </button>
            )}
          </div>
        </div>

        {submitted && (
          <div className="bg-primary-container/20 p-8 rounded-2xl border border-primary/20 flex flex-col items-center justify-center text-center animate-in zoom-in-95">
            <div className="w-20 h-20 bg-primary-container rounded-full flex items-center justify-center mb-4">
              <Award className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-3xl font-black mb-2">测试已提交</h3>
            <p className="text-xl text-on-surface-variant">得分: <span className="text-4xl font-black text-primary ml-2">{score}</span> / 100</p>
            <p className="text-sm mt-2 text-on-surface-variant">正确题数: {correctCount}/{total}</p>
            <p className={`text-sm mt-2 font-bold ${score >= passScore ? 'text-emerald-600' : 'text-red-600'}`}>
              {score >= passScore ? '本次达到合格分' : '本次未达到合格分，任务仍在待完成中'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeItems.map((item, index) => {
            const studentAnswer = normalizeAnswer(answers[item.entryId] || '');
            const isCorrect = studentAnswer === normalizeAnswer(item.word || '');

            return (
              <div key={item.entryId} className={`bg-surface-container-lowest p-6 rounded-xl shadow-sm border ${submitted ? (isCorrect ? 'border-green-500/50 bg-green-50/30' : 'border-red-500/50 bg-red-50/30') : 'border-outline-variant/20'}`}>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-sm font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded">#{index + 1}</span>
                  {activeTest.testType === '听写' && (
                    <button
                      onClick={() => playAudio(item.wordAudio)}
                      className="w-8 h-8 bg-secondary-container text-on-secondary-container rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="mb-4">
                  <p className="text-lg font-bold text-on-surface text-center">{item.meaning || '-'}</p>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={answers[item.entryId] || ''}
                    onChange={(e) => handleInputChange(item.entryId, e.target.value)}
                    disabled={submitted}
                    placeholder="输入英文单词..."
                    className={`w-full bg-surface-container border-2 rounded-lg p-3 text-center font-bold text-lg outline-none transition-colors ${
                      submitted
                        ? (isCorrect ? 'border-green-500 text-green-700' : 'border-red-500 text-red-700')
                        : 'border-transparent focus:border-primary'
                    }`}
                  />
                  {submitted && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCorrect ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <XCircle className="w-6 h-6 text-red-500" />}
                    </div>
                  )}
                </div>

                {submitted && !isCorrect && (
                  <div className="mt-3 text-center">
                    <span className="text-sm font-bold text-red-600">正确答案: {item.word}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <header className="relative overflow-hidden rounded-2xl p-12 bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
        <div className="relative z-10 max-w-2xl">
          <h1 className="font-headline font-extrabold text-5xl tracking-tight leading-tight mb-4">单词测试</h1>
          <p className="text-blue-50 text-lg">完成教师发布的测试任务，系统将记录历史最高分、最快用时与完成次数。</p>
        </div>
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="p-0">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          待完成任务 <span className="bg-error text-white text-sm px-2 py-0.5 rounded-full">{pendingTests.length}</span>
        </h2>

        {loading ? (
          <div className="text-sm text-on-surface-variant">加载中...</div>
        ) : pendingTests.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-500 opacity-50" />
            <p className="text-xl font-bold">当前没有待完成任务</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingTests.map((test) => renderTestCard(test, false))}
          </div>
        )}
      </div>

      <div className="p-0">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          已完成任务 <span className="bg-emerald-600 text-white text-sm px-2 py-0.5 rounded-full">{completedTests.length}</span>
        </h2>

        {completedTests.length === 0 ? (
          <div className="text-sm text-on-surface-variant">暂无已完成记录</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {completedTests.map((test) => renderTestCard(test, true))}
          </div>
        )}
      </div>
    </div>
  );
};
