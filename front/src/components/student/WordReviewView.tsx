import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, Play, RotateCcw, Volume2, XCircle } from 'lucide-react';
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

function normalizeLoose(value: string) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeStrict(value: string) {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
    .filter((item) => /[a-zA-Z]/.test(item.ch))
    .map((item) => item.idx);
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
  if (stage === 'enToZh') return '英译汉';
  if (stage === 'spelling') return '补全';
  return '汉译英';
}

function isLetterChar(ch: string) {
  return /[a-zA-Z]/.test(ch);
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
  const [currentChoices, setCurrentChoices] = useState<string[]>([]);
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

  const pendingReviews = reviews.filter((item) => item.status !== 'completed');
  const completedReviews = reviews.filter((item) => item.status === 'completed');

  const stages = useMemo(() => {
    if (!session) return [] as Stage[];
    const next: Stage[] = ['card', 'enToZh'];
    const enableSpelling = Boolean(session.enableSpelling ?? activeAssignment?.enableSpelling);
    const enableZhToEn = Boolean(session.enableZhToEn ?? activeAssignment?.enableZhToEn);
    if (enableSpelling) next.push('spelling');
    if (enableZhToEn) next.push('zhToEn');
    return next;
  }, [session, activeAssignment?.enableSpelling, activeAssignment?.enableZhToEn]);

  const itemMap = useMemo(() => {
    const map = new Map<string, WordReviewSessionItem>();
    (session?.items || []).forEach((item) => map.set(item.entryId, item));
    return map;
  }, [session?.items]);

  const currentStage = stages[stageIndex];
  const currentEntryId = queue[queueIndex];
  const currentItem = currentEntryId ? itemMap.get(currentEntryId) : undefined;
  const blankIndexes = useMemo(() => (currentItem ? buildBlankIndexes(currentItem.word || '') : []), [currentItem?.entryId]);

  const buildChoices = (item: WordReviewSessionItem, items: WordReviewSessionItem[]) => {
    const wrongPool = Array.from(
      new Set(items.map((row) => row.meaning || '').filter((meaning) => meaning && meaning !== item.meaning))
    );
    return shuffle([item.meaning || '', ...shuffle(wrongPool).slice(0, 3)]);
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
      const baseQueue = (started.items || []).map((item) => item.entryId);
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
      setCurrentChoices([]);
    } catch (e: any) {
      setError(e?.message || '开始今日复习失败');
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
        setQueueIndex((prev) => prev + 1);
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

      const baseQueue = (session.items || []).map((item) => item.entryId);
      setStageIndex((prev) => prev + 1);
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
    const ok = normalizeLoose(choice) === normalizeLoose(currentItem?.meaning || '');
    gotoNextItem(!ok, currentItem?.meaning || '', { enToZhCorrect: ok });
  };

  const handleSpellingSubmit = () => {
    const ok = normalizeStrict(spellingInput) === normalizeStrict(currentItem?.word || '');
    gotoNextItem(!ok, currentItem?.word || '', { spellingCorrect: ok });
  };

  const handleZhToEnSubmit = () => {
    const ok = normalizeStrict(zhToEnInput) === normalizeStrict(currentItem?.word || '');
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
    blankIndexes.forEach((idx, i) => {
      chars[idx] = slots[i] || '';
    });
    setSpellingInput(chars.join(''));
  }, [fillSlots, currentItem?.entryId, currentStage, blankIndexes]);

  useEffect(() => {
    if (!currentItem || currentStage !== 'enToZh') {
      setCurrentChoices([]);
      return;
    }
    setCurrentChoices(buildChoices(currentItem, session?.items || []));
  }, [currentItem?.entryId, currentStage, queueIndex, stageIndex, session?.items]);

  const submitSession = async () => {
    if (!token || !session) return;
    setSubmitting(true);
    setError(null);
    try {
      const results = session.items.map((item) => {
        const value = resultMap[item.entryId] || { cardDone: false, enToZhCorrect: false };
        return {
          entryId: item.entryId,
          cardDone: Boolean(value.cardDone),
          enToZhCorrect: Boolean(value.enToZhCorrect),
          spellingCorrect: value.spellingCorrect,
          zhToEnCorrect: value.zhToEnCorrect,
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
        <div key={task.assignmentId} className="flex flex-col rounded-xl border-2 border-outline-variant/20 p-6 opacity-80">
          <div className="mb-4 flex items-start justify-between gap-2">
            <h3 className="text-xl font-bold text-on-surface">{task.title}</h3>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">今日已完成</span>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 text-sm text-on-surface-variant">
            <span>每日数量：{task.dailyQuota}</span>
            <span>进度：{task.masteredWordCount}/{task.totalWordCount}</span>
            <span className="col-span-2 text-emerald-700 font-bold">今日任务已完成</span>
            <span className="col-span-2">模式：固定2项{task.enableSpelling ? ' + 补全' : ''}{task.enableZhToEn ? ' + 汉译英' : ''}</span>
          </div>
          <button disabled className="mt-auto w-full rounded-lg bg-surface-container-highest py-3 font-bold text-on-surface-variant cursor-not-allowed">
            今日复习任务已完成
          </button>
        </div>
      );
    }

    return (
      <div key={task.assignmentId} className="flex flex-col rounded-xl border-2 border-outline-variant/20 p-6 transition-colors hover:border-primary/50">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h3 className="text-xl font-bold text-on-surface">{task.title}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {completed ? '已完成' : '待完成'}
          </span>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3 text-sm text-on-surface-variant">
          <span>每日数量：{task.dailyQuota}</span>
          <span>进度：{task.masteredWordCount}/{task.totalWordCount}</span>
          <span className="col-span-2">模式：固定2项{task.enableSpelling ? ' + 补全' : ''}{task.enableZhToEn ? ' + 汉译英' : ''}</span>
        </div>
        <button onClick={() => startReview(task)} className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-bold text-on-primary transition-colors hover:bg-primary-dim">
          {completed ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          {completed ? '再次复习' : '开始今日复习'}
        </button>
      </div>
    );
  };

  if (session && activeAssignment) {
    if (!currentItem && !finished) {
      return (
        <div className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">当前范围内没有可复习词条，请返回任务列表重试。</div>
          <button onClick={backToList} className="rounded-lg bg-surface-container-highest px-6 py-2">返回复习列表</button>
        </div>
      );
    }

    return (
      <div className="relative space-y-6 animate-in fade-in">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex items-center justify-between rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
          <div>
            <h2 className="text-2xl font-black">{session.taskTitle}</h2>
            <p className="text-sm text-on-surface-variant">
              当前环节：{stageLabel(currentStage)} {stageIndex + 1}/{stages.length} / 当前进度：{Math.min(queueIndex + (finished ? 1 : 0), queue.length)}/{queue.length}
            </p>
          </div>
          <button onClick={backToList} className="rounded-full bg-surface-container-highest px-5 py-2 font-bold">返回列表</button>
        </div>

        {!finished && currentItem && (
          <div className="space-y-5 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
            <div className="text-xs font-bold text-on-surface-variant">第 {queueIndex + 1} 题 / 共 {queue.length} 题</div>

            {currentStage === 'card' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-on-surface-variant">{currentItem.phonetic || '-'}</div>
                    <h3 className="text-3xl font-black">{currentItem.word}</h3>
                    <div className="mt-1 text-on-surface-variant">{currentItem.meaning || '-'}</div>
                  </div>
                  <button onClick={() => playAudio(currentItem.wordAudio)} className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container" title="播放单词发音">
                    <Volume2 className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-on-surface-variant">单词卡片认识，可自由抄写帮助记忆。</p>
                {currentItem.sentence && (
                  <div className="rounded-lg bg-surface-container-low p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{currentItem.sentence}</p>
                      <button onClick={() => playAudio(currentItem.sentenceAudio)} className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-container/70" title="播放例句发音">
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>
                    {currentItem.sentenceCn && <p className="mt-1 text-xs text-on-surface-variant">{currentItem.sentenceCn}</p>}
                  </div>
                )}
                <textarea className="min-h-28 w-full rounded-lg border border-outline-variant/30 p-3" placeholder="在此自由抄写记忆..." />
                <div className="flex gap-2">
                  <button onClick={() => handleCard(true)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-6 py-2 font-bold text-on-primary">
                    <ChevronRight className="h-4 w-4" /> 认识了
                  </button>
                  <button onClick={() => handleCard(false)} className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-6 py-2 font-bold">
                    <ChevronLeft className="h-4 w-4" /> 还不会
                  </button>
                </div>
              </div>
            )}

            {currentStage === 'enToZh' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-on-surface-variant">{currentItem.phonetic || '-'}</div>
                    <h3 className="text-3xl font-black">{currentItem.word}</h3>
                  </div>
                  <button onClick={() => playAudio(currentItem.wordAudio)} className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container" title="播放单词发音">
                    <Volume2 className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-on-surface-variant">请选择这条英文对应的中文释义。</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(currentChoices.length ? currentChoices : [currentItem.meaning || '']).map((choice) => (
                    <button
                      key={choice}
                      onClick={() => handleEnToZh(choice)}
                      className="rounded-lg border border-outline-variant/30 p-3 text-left font-bold hover:bg-surface-container-highest"
                    >
                      {choice || '（空）'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStage === 'spelling' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black">补全：{currentItem.meaning || '-'}</h3>
                  </div>
                  <button onClick={() => playAudio(currentItem.wordAudio)} className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container" title="播放单词发音">
                    <Volume2 className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-on-surface-variant">根据中文和发音补全单词，不提前显示英文答案。</p>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {(currentItem.word || '').split('').map((ch, idx) => {
                    if (!isLetterChar(ch)) {
                      return <span key={`sep-${idx}`} className="px-1 text-lg font-black text-on-surface-variant">{ch}</span>;
                    }
                    const slotIndex = blankIndexes.indexOf(idx);
                    if (slotIndex === -1) {
                      return (
                        <span key={`char-${idx}`} className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-outline-variant/40 bg-surface-container-high px-2 text-lg font-black text-on-surface">
                          {ch}
                        </span>
                      );
                    }
                    if (slotIndex === -1) {
                      return (
                        <span key={`mask-${idx}`} className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant/40 bg-surface-container-high text-lg font-black text-on-surface-variant">
                          •
                        </span>
                      );
                    }
                    return (
                      <input
                        key={`slot-${idx}`}
                        ref={(el) => { fillInputRefs.current[slotIndex] = el; }}
                        value={fillSlots[slotIndex] || ''}
                        onChange={(e) => handleFillSlotChange(slotIndex, e.target.value)}
                        onKeyDown={(e) => handleFillSlotKeyDown(slotIndex, e)}
                        maxLength={1}
                        className="h-10 w-10 rounded-lg border border-outline-variant/40 bg-white text-center font-black"
                      />
                    );
                  })}
                </div>
                <button onClick={handleSpellingSubmit} className="rounded-lg bg-primary px-6 py-2 font-bold text-on-primary">提交本环节</button>
              </div>
            )}

            {currentStage === 'zhToEn' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-on-surface-variant">{currentItem.phonetic || '-'}</div>
                    <h3 className="text-2xl font-black">汉译英：{currentItem.meaning || '-'}</h3>
                  </div>
                  <button onClick={() => playAudio(currentItem.wordAudio)} className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container" title="播放单词发音">
                    <Volume2 className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-on-surface-variant">请输入英文答案，严格区分大小写，答错后会显示正确答案。</p>
                <input
                  value={zhToEnInput}
                  onChange={(e) => setZhToEnInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleZhToEnSubmit(); } }}
                  className="w-full rounded-lg border border-outline-variant/30 p-3"
                  placeholder="输入英文单词"
                />
                <button onClick={handleZhToEnSubmit} className="rounded-lg bg-primary px-6 py-2 font-bold text-on-primary">提交本环节</button>
              </div>
            )}
          </div>
        )}

        {finished && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-primary/20 bg-primary-container/20 p-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" />
            <h3 className="text-2xl font-black">今日复习已完成</h3>
            <p className="text-on-surface-variant">点击下方按钮提交结果并更新今日复习进度。</p>
            <button onClick={submitSession} disabled={submitting} className="rounded-full bg-primary px-8 py-3 font-bold text-on-primary disabled:opacity-50">
              {submitting ? '提交中...' : '提交今日复习'}
            </button>
          </div>
        )}

        {showError && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl bg-error/85 p-8 text-white backdrop-blur-sm">
            <XCircle className="mb-4 h-16 w-16" />
            <h2 className="mb-2 text-4xl font-black">回答错误</h2>
            <p className="text-xl">正确词条：{errorLabel}</p>
            <p className="mt-4 text-sm opacity-90">已触发熔断：下一题立刻重考，并在队尾再出现一次</p>
          </div>
        )}

        {showCorrect && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-2xl bg-green-600/80 p-8 text-white backdrop-blur-sm">
            <h2 className="mb-2 text-4xl font-black">回答正确</h2>
            <p className="text-lg">即将进入下一题</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-700 p-12 text-white shadow-lg">
        <div className="relative z-10 max-w-2xl">
          <h1 className="mb-4 font-headline text-5xl font-extrabold tracking-tight leading-tight">单词复习</h1>
          <p className="text-lg text-emerald-50">按教师发布的复习任务完成每日巩固，错题会自动回炉。</p>
        </div>
        <div className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-8 shadow-sm">
        <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold">
          待完成任务 <span className="rounded-full bg-error px-2 py-0.5 text-sm text-white">{pendingReviews.length}</span>
        </h2>
        {loading ? (
          <div className="text-sm text-on-surface-variant">加载中...</div>
        ) : pendingReviews.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant">
            <BookOpenCheck className="mx-auto mb-4 h-16 w-16 text-emerald-500 opacity-50" />
            <p className="text-xl font-bold">当前没有待完成复习任务</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {pendingReviews.map((task) => renderCard(task, false))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-8 shadow-sm">
        <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold">
          已完成任务 <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-sm text-white">{completedReviews.length}</span>
        </h2>
        {completedReviews.length === 0 ? (
          <div className="text-sm text-on-surface-variant">暂无已完成任务。</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {completedReviews.map((task) => renderCard(task, true))}
          </div>
        )}
      </div>
    </div>
  );
};
