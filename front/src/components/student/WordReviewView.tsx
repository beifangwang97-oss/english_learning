import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, CheckCircle2, Play, RotateCcw, Volume2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  StudentWordReviewAssignment,
  WordReviewDailySession,
  WordReviewSessionItem,
  wordReviewApi,
} from '../../lib/auth';
import { lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type Stage = 'card' | 'enToZh' | 'spelling' | 'zhToEn';

type WordStageResult = {
  cardDone: boolean;
  enToZhCorrect: boolean;
  spellingCorrect?: boolean;
  zhToEnCorrect?: boolean;
};

function normalizeAnswer(value: string) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function applyWrongWithFuseLimit(queue: string[], index: number, itemId: string): string[] {
  const before = queue.slice(0, index + 1);
  const after = queue.slice(index + 1).filter((id) => id !== itemId);
  const merged = [...before, itemId, ...after, itemId];
  return merged;
}

function buildBlankIndexes(answer: string): number[] {
  const letterIndexes = Array.from(answer)
    .map((ch, idx) => ({ ch, idx }))
    .filter((x) => /[a-zA-Z]/.test(x.ch))
    .map((x) => x.idx);
  if (letterIndexes.length === 0) return [];
  const minCount = Math.max(1, Math.floor(letterIndexes.length * 0.35));
  const picked: number[] = [];
  for (let i = 0; i < letterIndexes.length; i += 2) picked.push(letterIndexes[i]);
  while (picked.length < minCount) {
    const candidate = letterIndexes[picked.length % letterIndexes.length];
    if (!picked.includes(candidate)) picked.push(candidate);
    else break;
  }
  return picked.sort((a, b) => a - b);
}

function stageLabel(stage: Stage) {
  if (stage === 'card') return '单词卡片认识';
  if (stage === 'enToZh') return '英译汉选择';
  if (stage === 'spelling') return '单词补全';
  return '汉译英';
}

export const WordReviewView: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [reviews, setReviews] = useState<StudentWordReviewAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeAssignment, setActiveAssignment] = useState<StudentWordReviewAssignment | null>(null);
  const [session, setSession] = useState<WordReviewDailySession | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [resultMap, setResultMap] = useState<Record<string, WordStageResult>>({});

  const [spellingInput, setSpellingInput] = useState('');
  const [zhToEnInput, setZhToEnInput] = useState('');
  const [fillSlots, setFillSlots] = useState<string[]>([]);
  const fillInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [choiceOrderMap, setChoiceOrderMap] = useState<Record<string, string[]>>({});
  const [showError, setShowError] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [errorLabel, setErrorLabel] = useState('');
  const feedbackTimerRef = useRef<number | null>(null);

  const loadAssignments = async () => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await wordReviewApi.getStudentAssignments(token, Number(user.id));
      setReviews(rows || []);
    } catch (e: any) {
      setError(e?.message || '加载单词复习失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssignments();
    return () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    };
  }, [token, user?.id]);

  const pendingReviews = reviews.filter((r) => r.status !== 'completed');
  const completedReviews = reviews.filter((r) => r.status === 'completed');

  const stages = useMemo(() => {
    if (!session) return [] as Stage[];
    const s: Stage[] = ['card', 'enToZh'];
    if (session.enableSpelling) s.push('spelling');
    if (session.enableZhToEn) s.push('zhToEn');
    return s;
  }, [session]);

  const itemMap = useMemo(() => {
    const m = new Map<string, WordReviewSessionItem>();
    (session?.items || []).forEach((x) => m.set(x.entryId, x));
    return m;
  }, [session?.items]);

  const currentStage = stages[stageIndex];
  const currentEntryId = queue[queueIndex];
  const currentItem = currentEntryId ? itemMap.get(currentEntryId) : undefined;
  const blankIndexes = useMemo(() => (currentItem ? buildBlankIndexes(currentItem.word || '') : []), [currentItem?.entryId]);

  const buildChoices = (item: WordReviewSessionItem, items: WordReviewSessionItem[]) => {
    const wrongPool = items.map((x) => x.meaning || '').filter((m) => m && m !== item.meaning);
    return shuffle([item.meaning || '', ...shuffle(wrongPool).slice(0, 3)]);
  };

  const initChoiceMap = (rows: WordReviewSessionItem[]) => {
    const map: Record<string, string[]> = {};
    rows.forEach((item) => {
      map[item.entryId] = buildChoices(item, rows);
    });
    setChoiceOrderMap(map);
  };

  const showCorrectFeedback = (onDone: () => void) => {
    setShowCorrect(true);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setShowCorrect(false);
      onDone();
    }, 700);
  };

  const showWrongFeedback = (label: string, onDone: () => void) => {
    setErrorLabel(label || '');
    setShowError(true);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setShowError(false);
      onDone();
    }, 1100);
  };

  const startReview = async (assignment: StudentWordReviewAssignment) => {
    if (!token) return;
    setError(null);
    try {
      const started = await wordReviewApi.startDailySession(token, assignment.assignmentId);
      const baseQueue = (started.items || []).map((x) => x.entryId);
      setSession(started);
      setActiveAssignment(assignment);
      setStageIndex(0);
      setQueue(baseQueue);
      setQueueIndex(0);
      setResultMap({});
      setSpellingInput('');
      setZhToEnInput('');
      setFillSlots([]);
      setFinished(false);
      initChoiceMap(started.items || []);
    } catch (e: any) {
      setError(e?.message || '开始复习失败');
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

  const gotoNextItem = (wrong: boolean, errLabel: string, patch: Partial<WordStageResult>) => {
    if (!currentItem || !session || !currentStage) return;
    setResultMap((prev) => {
      const old = prev[currentItem.entryId] || {
        cardDone: false,
        enToZhCorrect: false,
        spellingCorrect: undefined,
        zhToEnCorrect: undefined,
      };
      return { ...prev, [currentItem.entryId]: { ...old, ...patch } };
    });

    const move = () => {
      const nextQueue = wrong ? applyWrongWithFuseLimit(queue, queueIndex, currentItem.entryId) : queue;
      const reachedEnd = queueIndex >= nextQueue.length - 1;
      if (!reachedEnd) {
        setQueue(nextQueue);
        setQueueIndex((v) => v + 1);
        setSpellingInput('');
        setZhToEnInput('');
        setFillSlots([]);
        return;
      }

      const lastStage = stageIndex >= stages.length - 1;
      if (lastStage) {
        setQueue(nextQueue);
        setQueueIndex(nextQueue.length);
        setFinished(true);
        return;
      }

      const baseQueue = (session.items || []).map((x) => x.entryId);
      setStageIndex((v) => v + 1);
      setQueue(baseQueue);
      setQueueIndex(0);
      setSpellingInput('');
      setZhToEnInput('');
      setFillSlots([]);
    };

    if (wrong) showWrongFeedback(errLabel, move);
    else showCorrectFeedback(move);
  };

  const handleCard = (known: boolean) => {
    gotoNextItem(!known, currentItem?.word || '', { cardDone: known });
  };

  const handleEnToZh = (choice: string) => {
    const ok = normalizeAnswer(choice) === normalizeAnswer(currentItem?.meaning || '');
    gotoNextItem(!ok, currentItem?.meaning || '', { enToZhCorrect: ok });
  };

  const handleSpellingSubmit = () => {
    const ok = normalizeAnswer(spellingInput) === normalizeAnswer(currentItem?.word || '');
    gotoNextItem(!ok, currentItem?.word || '', { spellingCorrect: ok });
  };

  const handleZhToEnSubmit = () => {
    const ok = normalizeAnswer(zhToEnInput) === normalizeAnswer(currentItem?.word || '');
    gotoNextItem(!ok, currentItem?.word || '', { zhToEnCorrect: ok });
  };

  const handleFillSlotChange = (slotIndex: number, value: string) => {
    const ch = value.replace(/[^a-zA-Z]/g, '').slice(-1);
    const next = Array.from({ length: blankIndexes.length }, (_, i) => fillSlots[i] || '');
    next[slotIndex] = ch;
    setFillSlots(next);
    if (ch) {
      window.setTimeout(() => {
        fillInputRefs.current[Math.min(blankIndexes.length - 1, slotIndex + 1)]?.focus();
      }, 0);
    }
  };

  const handleFillSlotKeyDown = (slotIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      fillInputRefs.current[Math.max(0, slotIndex - 1)]?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      fillInputRefs.current[Math.min(blankIndexes.length - 1, slotIndex + 1)]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSpellingSubmit();
    }
  };

  useEffect(() => {
    if (!currentItem || currentStage !== 'spelling') return;
    const slots = Array.from({ length: blankIndexes.length }, (_, i) => fillSlots[i] || '');
    const chars = (currentItem.word || '').split('');
    blankIndexes.forEach((idx, i) => { chars[idx] = slots[i] || ''; });
    setSpellingInput(chars.join(''));
  }, [fillSlots, currentItem?.entryId, currentStage]);

  const submitSession = async () => {
    if (!token || !session) return;
    setSubmitting(true);
    setError(null);
    try {
      const results = session.items.map((item) => {
        const v = resultMap[item.entryId] || { cardDone: false, enToZhCorrect: false };
        return {
          entryId: item.entryId,
          cardDone: Boolean(v.cardDone),
          enToZhCorrect: Boolean(v.enToZhCorrect),
          spellingCorrect: v.spellingCorrect,
          zhToEnCorrect: v.zhToEnCorrect,
        };
      });
      await wordReviewApi.submitDailySession(token, session.sessionId, { results });
      setSession(null);
      setActiveAssignment(null);
      setFinished(false);
      await loadAssignments();
    } catch (e: any) {
      setError(e?.message || '提交复习结果失败');
    } finally {
      setSubmitting(false);
    }
  };

  const backToList = () => {
    setSession(null);
    setActiveAssignment(null);
    setFinished(false);
    setStageIndex(0);
    setQueue([]);
    setQueueIndex(0);
    setResultMap({});
    setShowError(false);
    setShowCorrect(false);
  };

  const renderCard = (task: StudentWordReviewAssignment, completed: boolean) => {
    if (!completed && task.todayDone) {
      return (
        <div key={task.assignmentId} className="border-2 border-outline-variant/20 rounded-xl p-6 flex flex-col opacity-80">
          <div className="flex justify-between items-start mb-4 gap-2">
            <h3 className="text-xl font-bold text-on-surface">{task.title}</h3>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">今日已完成</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-on-surface-variant mb-6">
            <span>每日数量：{task.dailyQuota}</span>
            <span>进度：{task.masteredWordCount}/{task.totalWordCount}</span>
            <span className="col-span-2 text-emerald-700 font-bold">今日任务已完成</span>
            <span className="col-span-2">模式：固定2项{task.enableSpelling ? ' + 补全' : ''}{task.enableZhToEn ? ' + 汉译英' : ''}</span>
          </div>
          <button
            disabled
            className="mt-auto w-full py-3 bg-surface-container-highest text-on-surface-variant font-bold rounded-lg cursor-not-allowed"
          >
            今日复习任务已完成
          </button>
        </div>
      );
    }

    return (
    <div key={task.assignmentId} className="border-2 border-outline-variant/20 rounded-xl p-6 hover:border-primary/50 transition-colors flex flex-col">
      <div className="flex justify-between items-start mb-4 gap-2">
        <h3 className="text-xl font-bold text-on-surface">{task.title}</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {completed ? '已完成' : '待完成'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm text-on-surface-variant mb-6">
        <span>每日数量：{task.dailyQuota}</span>
        <span>进度：{task.masteredWordCount}/{task.totalWordCount}</span>
        <span className="col-span-2">
          模式：固定2项{task.enableSpelling ? ' + 补全' : ''}{task.enableZhToEn ? ' + 汉译英' : ''}
        </span>
      </div>
      <button
        onClick={() => startReview(task)}
        className="mt-auto w-full py-3 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
      >
        {completed ? <RotateCcw className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        {completed ? '再次复习' : '开始今日复习'}
      </button>
    </div>
    );
  };

  if (session && activeAssignment) {
    if (!currentItem && !finished) {
      return (
        <div className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">今日没有可复习单词，可能已经全部掌握。</div>
          <button onClick={backToList} className="px-6 py-2 rounded-lg bg-surface-container-highest">返回任务列表</button>
        </div>
      );
    }

    return (
      <div className="space-y-6 animate-in fade-in relative">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex items-center justify-between bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6">
          <div>
            <h2 className="text-2xl font-black">{session.taskTitle}</h2>
            <p className="text-sm text-on-surface-variant">
              当前环节：{stageLabel(currentStage)}（{stageIndex + 1}/{stages.length}） · 环节内进度：{Math.min(queueIndex + (finished ? 1 : 0), queue.length)}/{queue.length}
            </p>
          </div>
          <button onClick={backToList} className="px-5 py-2 rounded-full bg-surface-container-highest font-bold">返回</button>
        </div>

        {!finished && currentItem && (
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 space-y-5">
            <div className="text-xs text-on-surface-variant font-bold">第 {queueIndex + 1} 词 / 共 {queue.length} 词</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-on-surface-variant">{currentItem.phonetic || '-'}</div>
                <h3 className="text-3xl font-black">{currentItem.word}</h3>
                <div className="text-on-surface-variant mt-1">{currentItem.meaning || '-'}</div>
              </div>
              <button onClick={() => playAudio(currentItem.wordAudio)} className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center" title="播放单词录音">
                <Volume2 className="w-5 h-5" />
              </button>
            </div>

            {currentStage === 'card' && (
              <div className="space-y-3">
                <p className="text-sm text-on-surface-variant">单词卡片认识（可自由抄写）</p>
                {currentItem.sentence && (
                  <div className="rounded-lg bg-surface-container-low p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{currentItem.sentence}</p>
                      <button onClick={() => playAudio(currentItem.sentenceAudio)} className="w-8 h-8 rounded-full bg-secondary-container/70 flex items-center justify-center" title="播放例句录音">
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    {currentItem.sentenceCn && <p className="text-xs text-on-surface-variant mt-1">{currentItem.sentenceCn}</p>}
                  </div>
                )}
                <textarea className="w-full rounded-lg border border-outline-variant/30 p-3 min-h-28" placeholder="在此自由抄写记忆..." />
                <div className="flex gap-2">
                  <button onClick={() => handleCard(true)} className="px-6 py-2 rounded-lg bg-primary text-on-primary font-bold inline-flex items-center gap-1">
                    <ChevronRight className="w-4 h-4" /> 认识了
                  </button>
                  <button onClick={() => handleCard(false)} className="px-6 py-2 rounded-lg border border-outline-variant/40 font-bold inline-flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> 不认识
                  </button>
                </div>
              </div>
            )}

            {currentStage === 'enToZh' && (
              <div className="space-y-3">
                <p className="text-sm text-on-surface-variant">英译汉选择</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(choiceOrderMap[currentItem.entryId] || [currentItem.meaning || '']).map((choice) => (
                    <button
                      key={choice}
                      onClick={() => handleEnToZh(choice)}
                      className="rounded-lg border border-outline-variant/30 p-3 text-left hover:bg-surface-container-highest font-bold"
                    >
                      {choice || '（空）'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStage === 'spelling' && (
              <div className="space-y-3">
                <p className="text-sm text-on-surface-variant">单词补全</p>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {(currentItem.word || '').split('').map((ch, idx) => {
                    const slotIndex = blankIndexes.indexOf(idx);
                    if (slotIndex === -1) return <span key={`char-${idx}`} className="text-lg font-black px-1">{ch}</span>;
                    return (
                      <input
                        key={`slot-${idx}`}
                        ref={(el) => { fillInputRefs.current[slotIndex] = el; }}
                        value={fillSlots[slotIndex] || ''}
                        onChange={(e) => handleFillSlotChange(slotIndex, e.target.value)}
                        onKeyDown={(e) => handleFillSlotKeyDown(slotIndex, e)}
                        maxLength={1}
                        className="w-10 h-10 text-center rounded-lg border border-outline-variant/40 bg-white font-black"
                      />
                    );
                  })}
                </div>
                <button onClick={handleSpellingSubmit} className="px-6 py-2 rounded-lg bg-primary text-on-primary font-bold">提交本环节</button>
              </div>
            )}

            {currentStage === 'zhToEn' && (
              <div className="space-y-3">
                <p className="text-sm text-on-surface-variant">汉译英</p>
                <input
                  value={zhToEnInput}
                  onChange={(e) => setZhToEnInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleZhToEnSubmit(); } }}
                  className="w-full rounded-lg border border-outline-variant/30 p-3"
                  placeholder="输入英文单词"
                />
                <button onClick={handleZhToEnSubmit} className="px-6 py-2 rounded-lg bg-primary text-on-primary font-bold">提交本环节</button>
              </div>
            )}
          </div>
        )}

        {finished && (
          <div className="bg-primary-container/20 p-8 rounded-2xl border border-primary/20 flex flex-col items-center justify-center text-center gap-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-600" />
            <h3 className="text-2xl font-black">今日复习已完成</h3>
            <p className="text-on-surface-variant">提交后系统会更新完成进度，并自动判断任务是否进入已完成。</p>
            <button onClick={submitSession} disabled={submitting} className="px-8 py-3 bg-primary text-on-primary font-bold rounded-full disabled:opacity-50">
              {submitting ? '提交中...' : '提交今日复习'}
            </button>
          </div>
        )}

        {showError && (
          <div className="absolute inset-0 z-50 bg-error/85 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8 rounded-2xl">
            <XCircle className="w-16 h-16 mb-4" />
            <h2 className="text-4xl font-black mb-2">回答错误</h2>
            <p className="text-xl">正确词条：{errorLabel}</p>
            <p className="mt-4 text-sm opacity-90">已触发熔断：下一题立刻重考，并在队尾再出现一次</p>
          </div>
        )}

        {showCorrect && (
          <div className="absolute inset-0 z-40 bg-green-600/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8 rounded-2xl">
            <h2 className="text-4xl font-black mb-2">回答正确</h2>
            <p className="text-lg">即将进入下一题</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <header className="relative overflow-hidden rounded-2xl p-12 bg-gradient-to-br from-teal-500 to-emerald-700 text-white shadow-lg">
        <div className="relative z-10 max-w-2xl">
          <h1 className="font-headline font-extrabold text-5xl tracking-tight leading-tight mb-4">单词复习</h1>
          <p className="text-emerald-50 text-lg">每天完成老师要求数量，系统按优先级抽词，直到该任务词池全部掌握。</p>
        </div>
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/20">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          待完成任务 <span className="bg-error text-white text-sm px-2 py-0.5 rounded-full">{pendingReviews.length}</span>
        </h2>
        {loading ? (
          <div className="text-sm text-on-surface-variant">加载中...</div>
        ) : pendingReviews.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <BookOpenCheck className="w-16 h-16 mx-auto mb-4 text-emerald-500 opacity-50" />
            <p className="text-xl font-bold">当前没有待完成复习任务</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingReviews.map((task) => renderCard(task, false))}
          </div>
        )}
      </div>

      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/20">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          已完成任务 <span className="bg-emerald-600 text-white text-sm px-2 py-0.5 rounded-full">{completedReviews.length}</span>
        </h2>
        {completedReviews.length === 0 ? (
          <div className="text-sm text-on-surface-variant">暂无已完成记录</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {completedReviews.map((task) => renderCard(task, true))}
          </div>
        )}
      </div>
    </div>
  );
};
