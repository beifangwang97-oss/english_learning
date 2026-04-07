import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MOCK_QUIZ, MOCK_READING } from '../data/mock';
import { useAuth } from '../context/AuthContext';
import { useTimer } from '../context/TimerContext';
import { cn } from '../lib/utils';
import { learningProgressApi } from '../lib/auth';
import { lexiconApi, LearningEntry, LearningGroupSummary } from '../lib/lexicon';
import { getSessionToken } from '../lib/session';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, ClipboardList, FileQuestion, HelpCircle, LayoutDashboard, Library, LogOut, MessageCircle, Mic2, NotebookPen, Volume2, XCircle } from 'lucide-react';

type ModuleType = 'vocab' | 'phrase' | 'reading' | 'quiz';
type LearnModule = 'vocab' | 'phrase';
type StepNo = 1 | 2 | 3 | 4;

type LearnItem = {
  id: string;
  groupId: number;
  en: string;
  cn: string;
  phonetic?: string;
  sentence?: string;
  sentenceCn?: string;
  wordAudio?: string;
  sentenceAudio?: string;
};

type EngineState = {
  groupNo: number;
  step: StepNo;
  queue: string[];
  index: number;
  recognizeInput: string;
  fillSlots: string[];
  fillCursor: number;
  spellInput: string;
  recognizeOk: boolean;
  stepDone: Record<number, boolean>;
};

type GroupProgressView = {
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  itemTotal?: number;
  learnedCount?: number;
};

type UnitMeta = {
  bookVersion: string;
  grade: string;
  semester: string;
  unit: string;
};

const defaultEngine = (): EngineState => ({
  groupNo: 1,
  step: 1,
  queue: [],
  index: 0,
  recognizeInput: '',
  fillSlots: [],
  fillCursor: 0,
  spellInput: '',
  recognizeOk: false,
  stepDone: {},
});

const normalizeText = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
const hasPunctuation = (v: string) => /[^a-zA-Z\s]/.test(v);

function safeParseSession(raw?: string): Partial<EngineState> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeQueue(savedQueue: string[] | undefined, baseQueue: string[]): string[] {
  if (!baseQueue.length) return [];
  if (!Array.isArray(savedQueue) || savedQueue.length === 0) return baseQueue;
  const valid = new Set(baseQueue);
  const filtered = savedQueue.filter((id) => valid.has(id));
  return filtered.length ? filtered : baseQueue;
}

function applyWrongWithFuseLimit(queue: string[], index: number, itemId: string): string[] {
  const before = queue.slice(0, index + 1);
  const after = queue.slice(index + 1).filter((id) => id !== itemId);
  let merged = [...before, itemId, ...after, itemId];

  const futurePositions: number[] = [];
  for (let i = index + 1; i < merged.length; i += 1) {
    if (merged[i] === itemId) futurePositions.push(i);
  }
  while (futurePositions.length > 2) {
    const removeAt = futurePositions.pop();
    if (removeAt !== undefined) merged.splice(removeAt, 1);
  }
  return merged;
}

function mapEntryToLearnItem(entry: LearningEntry): LearnItem {
  const firstMeaning = entry.meanings?.[0];
  return {
    id: entry.id,
    groupId: Number(entry.group_no || 1),
    en: entry.word,
    cn: firstMeaning?.meaning || '',
    phonetic: entry.phonetic,
    sentence: firstMeaning?.example || '',
    sentenceCn: firstMeaning?.example_zh || '',
    wordAudio: entry.word_audio || entry.phrase_audio || '',
    sentenceAudio: firstMeaning?.example_audio || '',
  };
}

function parseUnitMeta(unitId: string): UnitMeta | null {
  const parts = unitId.split('||');
  if (parts.length !== 4) return null;
  const [bookVersion, grade, semester, unit] = parts.map((x) => x.trim());
  if (!bookVersion || !grade || !semester || !unit) return null;
  return { bookVersion, grade, semester, unit };
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

function rebuildFilledText(answer: string, blankIndexes: number[], slots: string[]): string {
  const chars = answer.split('');
  blankIndexes.forEach((idx, i) => {
    chars[idx] = slots[i] || '';
  });
  return chars.join('');
}

export const StudentUnit: React.FC = () => {
  const { id } = useParams();
  const unitId = id ? decodeURIComponent(id) : '';
  const unitMeta = useMemo(() => parseUnitMeta(unitId), [unitId]);

  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { startTimer, pauseTimer } = useTimer();
  const token = useMemo(() => getSessionToken(), []);

  const [currentModule, setCurrentModule] = useState<ModuleType>('vocab');
  const [showError, setShowError] = useState(false);
  const [errorLabel, setErrorLabel] = useState('');
  const [showCorrect, setShowCorrect] = useState(false);
  const [vocabStepDonePrompt, setVocabStepDonePrompt] = useState<StepNo | null>(null);
  const [phraseStepDonePrompt, setPhraseStepDonePrompt] = useState<StepNo | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(true);

  const [vocabEngine, setVocabEngine] = useState<EngineState>(defaultEngine());
  const [phraseEngine, setPhraseEngine] = useState<EngineState>(defaultEngine());

  const [vocabProgress, setVocabProgress] = useState<Record<number, GroupProgressView>>({});
  const [phraseProgress, setPhraseProgress] = useState<Record<number, GroupProgressView>>({});

  const [vocabGroupSummary, setVocabGroupSummary] = useState<LearningGroupSummary[]>([]);
  const [phraseGroupSummary, setPhraseGroupSummary] = useState<LearningGroupSummary[]>([]);

  const [vocabGroupItems, setVocabGroupItems] = useState<Record<number, LearnItem[]>>({});
  const [phraseGroupItems, setPhraseGroupItems] = useState<Record<number, LearnItem[]>>({});
  const [vocabLoadingGroups, setVocabLoadingGroups] = useState<Record<number, boolean>>({});
  const [phraseLoadingGroups, setPhraseLoadingGroups] = useState<Record<number, boolean>>({});

  const recognizeClearTimerRef = useRef<number | null>(null);
  const vocabSessionSaveRef = useRef<number | null>(null);
  const phraseSessionSaveRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const fillInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const correctTimerRef = useRef<number | null>(null);

  const vocabItemMap = useMemo(() => new Map(Object.values(vocabGroupItems).flat().map((x) => [x.id, x])), [vocabGroupItems]);
  const phraseItemMap = useMemo(() => new Map(Object.values(phraseGroupItems).flat().map((x) => [x.id, x])), [phraseGroupItems]);

  const vocabGroups = useMemo(() => vocabGroupSummary.map((x) => x.groupNo), [vocabGroupSummary]);
  const phraseGroups = useMemo(() => phraseGroupSummary.map((x) => x.groupNo), [phraseGroupSummary]);

  const getActiveGroup = (module: LearnModule): number => {
    const groups = module === 'vocab' ? vocabGroups : phraseGroups;
    const progress = module === 'vocab' ? vocabProgress : phraseProgress;
    const firstPending = groups.find((g) => !progress[g]?.completedAt);
    return firstPending || groups[0] || 1;
  };

  const currentVocab = vocabItemMap.get(vocabEngine.queue[vocabEngine.index] || '');
  const currentPhrase = phraseItemMap.get(phraseEngine.queue[phraseEngine.index] || '');
  const currentModuleEngine = currentModule === 'phrase' ? phraseEngine : vocabEngine;
  const currentModuleItem = currentModule === 'phrase' ? currentPhrase : currentVocab;
  const currentBlankIndexes = useMemo(
    () => (currentModuleItem ? buildBlankIndexes(currentModuleItem.en) : []),
    [currentModuleItem?.id]
  );

  const ensureGroupItemsLoaded = async (module: LearnModule, groupNo: number): Promise<LearnItem[]> => {
    if (!token || !unitMeta) return [];
    if (module === 'vocab') {
      if (vocabGroupItems[groupNo]) return vocabGroupItems[groupNo];
      if (vocabLoadingGroups[groupNo]) return [];
      setVocabLoadingGroups((prev) => ({ ...prev, [groupNo]: true }));
      try {
        const payload = await lexiconApi.getLearningItemsByGroup(token, {
          type: 'word',
          bookVersion: unitMeta.bookVersion,
          grade: unitMeta.grade,
          semester: unitMeta.semester,
          unit: unitMeta.unit,
          groupNo,
        });
        const mapped = payload.items.map(mapEntryToLearnItem);
        setVocabGroupItems((prev) => ({ ...prev, [groupNo]: mapped }));
        return mapped;
      } finally {
        setVocabLoadingGroups((prev) => ({ ...prev, [groupNo]: false }));
      }
      return [];
    }

    if (phraseGroupItems[groupNo]) return phraseGroupItems[groupNo];
    if (phraseLoadingGroups[groupNo]) return [];
    setPhraseLoadingGroups((prev) => ({ ...prev, [groupNo]: true }));
    try {
      const payload = await lexiconApi.getLearningItemsByGroup(token, {
        type: 'phrase',
        bookVersion: unitMeta.bookVersion,
        grade: unitMeta.grade,
        semester: unitMeta.semester,
        unit: unitMeta.unit,
        groupNo,
      });
      const mapped = payload.items.map(mapEntryToLearnItem);
      setPhraseGroupItems((prev) => ({ ...prev, [groupNo]: mapped }));
      return mapped;
    } finally {
      setPhraseLoadingGroups((prev) => ({ ...prev, [groupNo]: false }));
    }
    return [];
  };

  const buildQueueForGroup = (module: LearnModule, groupNo: number): string[] => {
    const items = module === 'vocab' ? (vocabGroupItems[groupNo] || []) : (phraseGroupItems[groupNo] || []);
    return items.map((x) => x.id);
  };

  useEffect(() => {
    startTimer();
    return () => pauseTimer();
  }, [startTimer, pauseTimer]);

  useEffect(() => {
    const load = async () => {
      if (!token || !user?.id || !unitId || !unitMeta) return;
      setLoadingProgress(true);
      setPageError(null);
      try {
        const uid = Number(user.id);

        const [wordSummary, phraseSummary, vSession, pSession, vGp, pGp] = await Promise.all([
          lexiconApi.getLearningSummary(token, {
            type: 'word',
            bookVersion: unitMeta.bookVersion,
            grade: unitMeta.grade,
            semester: unitMeta.semester,
            unit: unitMeta.unit,
          }),
          lexiconApi.getLearningSummary(token, {
            type: 'phrase',
            bookVersion: unitMeta.bookVersion,
            grade: unitMeta.grade,
            semester: unitMeta.semester,
            unit: unitMeta.unit,
          }),
          learningProgressApi.getSession(token, uid, unitId, 'vocab'),
          learningProgressApi.getSession(token, uid, unitId, 'phrase'),
          learningProgressApi.getGroupProgress(token, uid, unitId, 'vocab'),
          learningProgressApi.getGroupProgress(token, uid, unitId, 'phrase'),
        ]);

        setVocabGroupSummary(wordSummary.groups || []);
        setPhraseGroupSummary(phraseSummary.groups || []);

        const vMap: Record<number, GroupProgressView> = {};
        vGp.forEach((x) => { vMap[x.groupNo] = x; });
        setVocabProgress(vMap);

        const pMap: Record<number, GroupProgressView> = {};
        pGp.forEach((x) => { pMap[x.groupNo] = x; });
        setPhraseProgress(pMap);

        const vSaved = safeParseSession(vSession?.stateJson);
        const pSaved = safeParseSession(pSession?.stateJson);

        const wordGroupNos = (wordSummary.groups || []).map((x) => Number(x.groupNo)).filter((x) => x > 0);
        const phraseGroupNos = (phraseSummary.groups || []).map((x) => Number(x.groupNo)).filter((x) => x > 0);
        const vSavedGroup = Number(vSaved?.groupNo || 0);
        const pSavedGroup = Number(pSaved?.groupNo || 0);
        const vGroup = wordGroupNos.includes(vSavedGroup) ? vSavedGroup : (wordGroupNos[0] || 1);
        const pGroup = phraseGroupNos.includes(pSavedGroup) ? pSavedGroup : (phraseGroupNos[0] || 1);

        const [vItems, pItems] = await Promise.all([
          ensureGroupItemsLoaded('vocab', vGroup),
          ensureGroupItemsLoaded('phrase', pGroup),
        ]);

        const vBaseQueue = vItems.map((x) => x.id);
        const pBaseQueue = pItems.map((x) => x.id);
        const vQueue = normalizeQueue(Array.isArray(vSaved?.queue) ? (vSaved?.queue as string[]) : [], vBaseQueue);
        const pQueue = normalizeQueue(Array.isArray(pSaved?.queue) ? (pSaved?.queue as string[]) : [], pBaseQueue);
        const vIndex = Math.min(Math.max(0, Number(vSaved?.index || 0)), Math.max(0, vQueue.length - 1));
        const pIndex = Math.min(Math.max(0, Number(pSaved?.index || 0)), Math.max(0, pQueue.length - 1));

        setVocabEngine((prev) => ({
          ...prev,
          groupNo: vGroup,
          step: (Number(vSaved?.step || 1) as StepNo),
          queue: vQueue,
          index: vIndex,
          stepDone: (vSaved?.stepDone as Record<number, boolean>) || {},
        }));
        setPhraseEngine((prev) => ({
          ...prev,
          groupNo: pGroup,
          step: (Number(pSaved?.step || 1) as StepNo),
          queue: pQueue,
          index: pIndex,
          stepDone: (pSaved?.stepDone as Record<number, boolean>) || {},
        }));
      } catch (e: any) {
        setPageError(e?.message || '词库加载失败');
      } finally {
        setLoadingProgress(false);
      }
    };
    load();
  }, [token, user?.id, unitId, unitMeta?.bookVersion, unitMeta?.grade, unitMeta?.semester, unitMeta?.unit]);

  const ensureGroupStarted = async (module: LearnModule, groupNo: number) => {
    if (!token || !user?.id || !unitId) return;
    const progressMap = module === 'vocab' ? vocabProgress : phraseProgress;
    if (progressMap[groupNo]?.startedAt) return;

    const total = module === 'vocab'
      ? (vocabGroupSummary.find((x) => x.groupNo === groupNo)?.count || 0)
      : (phraseGroupSummary.find((x) => x.groupNo === groupNo)?.count || 0);

    const saved = await learningProgressApi.startGroup(token, {
      userId: Number(user.id), unitId, module, groupNo, itemTotal: total,
    });
    if (module === 'vocab') setVocabProgress((prev) => ({ ...prev, [groupNo]: saved }));
    else setPhraseProgress((prev) => ({ ...prev, [groupNo]: saved }));
  };

  useEffect(() => {
    if (!loadingProgress && vocabEngine.groupNo) ensureGroupStarted('vocab', vocabEngine.groupNo);
  }, [loadingProgress, vocabEngine.groupNo]);

  useEffect(() => {
    if (!loadingProgress && phraseEngine.groupNo) ensureGroupStarted('phrase', phraseEngine.groupNo);
  }, [loadingProgress, phraseEngine.groupNo]);

  const scheduleSaveSession = (module: LearnModule, engine: EngineState) => {
    if (!token || !user?.id || !unitId) return;

    const payload = JSON.stringify({
      groupNo: engine.groupNo,
      step: engine.step,
      queue: engine.queue,
      index: engine.index,
      stepDone: engine.stepDone,
    });

    if (module === 'vocab') {
      if (vocabSessionSaveRef.current) window.clearTimeout(vocabSessionSaveRef.current);
      vocabSessionSaveRef.current = window.setTimeout(() => {
        learningProgressApi.upsertSession(token, {
          userId: Number(user.id), unitId, module: 'vocab', stateJson: payload,
        }).catch(() => {});
      }, 500);
      return;
    }

    if (phraseSessionSaveRef.current) window.clearTimeout(phraseSessionSaveRef.current);
    phraseSessionSaveRef.current = window.setTimeout(() => {
      learningProgressApi.upsertSession(token, {
        userId: Number(user.id), unitId, module: 'phrase', stateJson: payload,
      }).catch(() => {});
    }, 500);
  };

  useEffect(() => {
    if (!loadingProgress) scheduleSaveSession('vocab', vocabEngine);
  }, [vocabEngine.groupNo, vocabEngine.step, vocabEngine.queue, vocabEngine.index, loadingProgress]);

  useEffect(() => {
    if (!loadingProgress) scheduleSaveSession('phrase', phraseEngine);
  }, [phraseEngine.groupNo, phraseEngine.step, phraseEngine.queue, phraseEngine.index, loadingProgress]);

  const getOptions = (module: LearnModule, item: LearnItem) => {
    const pool = module === 'vocab' ? (vocabGroupItems[vocabEngine.groupNo] || []) : (phraseGroupItems[phraseEngine.groupNo] || []);
    const distractors = pool.filter((x) => x.id !== item.id).map((x) => x.cn).filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 3);
    return [item.cn, ...distractors].sort(() => Math.random() - 0.5);
  };

  const goNext = async (module: LearnModule, wrong: boolean) => {
    const setEngine = module === 'vocab' ? setVocabEngine : setPhraseEngine;
    const engine = module === 'vocab' ? vocabEngine : phraseEngine;
    const item = module === 'vocab' ? currentVocab : currentPhrase;
    if (!item) return;

    const groups = module === 'vocab' ? vocabGroups : phraseGroups;

    setEngine((prev) => {
      let queue = prev.queue;
      if (wrong) queue = applyWrongWithFuseLimit(prev.queue, prev.index, item.id);

      const reachedGroupEnd = prev.index >= queue.length - 1;
      if (!reachedGroupEnd) {
        return {
          ...prev,
          queue,
          index: prev.index + 1,
          recognizeInput: '',
          fillSlots: [],
          fillCursor: 0,
          spellInput: '',
          recognizeOk: false,
        };
      }

      const doneMap = { ...prev.stepDone, [prev.step]: true };
      const allStepDone = [1, 2, 3, 4].every((s) => Boolean(doneMap[s]));
      if (!allStepDone) {
        return {
          ...prev,
          queue,
          index: 0,
          stepDone: doneMap,
          recognizeInput: '',
          fillSlots: [],
          fillCursor: 0,
          spellInput: '',
          recognizeOk: false,
        };
      }

      const groupIdx = groups.indexOf(prev.groupNo);
      const nextGroup = groups[groupIdx + 1];
      const isLastGroup = !nextGroup;
      return {
        ...prev,
        groupNo: isLastGroup ? prev.groupNo : nextGroup,
        step: 1,
        queue: isLastGroup ? queue : buildQueueForGroup(module, nextGroup),
        index: 0,
        stepDone: isLastGroup ? doneMap : {},
        recognizeInput: '',
        fillSlots: [],
        fillCursor: 0,
        spellInput: '',
        recognizeOk: false,
      };
    });

    const reachedLastOfStep = engine.index >= engine.queue.length - 1;
    if (!wrong && reachedLastOfStep && engine.step < 4) {
      if (module === 'vocab') setVocabStepDonePrompt(engine.step);
      else setPhraseStepDonePrompt(engine.step);
    }

    const doneAfter = { ...engine.stepDone, [engine.step]: true };
    const shouldCompleteGroup = reachedLastOfStep && [1, 2, 3, 4].every((s) => Boolean(doneAfter[s]));
    if (shouldCompleteGroup && token && user?.id && unitId) {
      const groupNo = engine.groupNo;
      const total = module === 'vocab'
        ? (vocabGroupSummary.find((x) => x.groupNo === groupNo)?.count || 0)
        : (phraseGroupSummary.find((x) => x.groupNo === groupNo)?.count || 0);

      const saved = await learningProgressApi.completeGroup(token, {
        userId: Number(user.id), unitId, module, groupNo, itemTotal: total, learnedCount: total,
      });
      if (module === 'vocab') setVocabProgress((prev) => ({ ...prev, [groupNo]: saved }));
      else setPhraseProgress((prev) => ({ ...prev, [groupNo]: saved }));
    }
  };

  const goPrev = (module: LearnModule) => {
    const setEngine = module === 'vocab' ? setVocabEngine : setPhraseEngine;
    setEngine((prev) => ({
      ...prev,
      index: Math.max(0, prev.index - 1),
      recognizeInput: '',
      fillSlots: [],
      fillCursor: 0,
      spellInput: '',
      recognizeOk: false,
    }));
  };

  const checkSpelling = (input: string, expected: string) => {
    if (hasPunctuation(input)) return false;
    return normalizeText(input) === normalizeText(expected);
  };

  const playAudio = async (path?: string) => {
    if (!path || !token) return;
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      }
      await lexiconApi.playAudioWithAuth(token, path);
      currentAudioRef.current = null;
    } catch {
      // ignore audio error
    }
  };

  const withCorrectFeedback = (fn: () => Promise<void> | void) => {
    if (correctTimerRef.current) window.clearTimeout(correctTimerRef.current);
    setShowCorrect(true);
    correctTimerRef.current = window.setTimeout(async () => {
      setShowCorrect(false);
      await fn();
    }, 450);
  };

  const handleRecognizeInput = (module: LearnModule, value: string) => {
    const setter = module === 'vocab' ? setVocabEngine : setPhraseEngine;
    const item = module === 'vocab' ? currentVocab : currentPhrase;
    setter((prev) => ({ ...prev, recognizeInput: value, recognizeOk: false }));
    if (!item) return;
    if (checkSpelling(value, item.en)) {
      setter((prev) => ({ ...prev, recognizeOk: true, recognizeInput: '' }));
      if (recognizeClearTimerRef.current) window.clearTimeout(recognizeClearTimerRef.current);
      recognizeClearTimerRef.current = window.setTimeout(() => {
        setter((prev) => ({ ...prev, recognizeOk: false }));
      }, 900);
    }
  };

  const handleStep2Choose = async (module: LearnModule, chosenCn: string) => {
    const item = module === 'vocab' ? currentVocab : currentPhrase;
    if (!item) return;
    const ok = chosenCn === item.cn;
    if (!ok) {
      setErrorLabel(`${item.en} / ${item.cn}`);
      setShowError(true);
      setTimeout(() => setShowError(false), 1200);
      await goNext(module, true);
      return;
    }
    withCorrectFeedback(() => goNext(module, false));
  };

  const handleStep3Submit = async (module: LearnModule) => {
    const engine = module === 'vocab' ? vocabEngine : phraseEngine;
    const item = module === 'vocab' ? currentVocab : currentPhrase;
    if (!item) return;
    const blanks = buildBlankIndexes(item.en);
    const rebuilt = rebuildFilledText(item.en, blanks, engine.fillSlots);
    const ok = checkSpelling(rebuilt, item.en);
    if (!ok) {
      setErrorLabel(`${item.en} / ${item.cn}`);
      setShowError(true);
      setTimeout(() => setShowError(false), 1200);
      await goNext(module, true);
      return;
    }
    withCorrectFeedback(() => goNext(module, false));
  };

  const handleStep4Submit = async (module: LearnModule) => {
    const engine = module === 'vocab' ? vocabEngine : phraseEngine;
    const item = module === 'vocab' ? currentVocab : currentPhrase;
    if (!item) return;
    const ok = checkSpelling(engine.spellInput, item.en);
    if (!ok) {
      setErrorLabel(`${item.en} / ${item.cn}`);
      setShowError(true);
      setTimeout(() => setShowError(false), 1200);
      await goNext(module, true);
      return;
    }
    withCorrectFeedback(() => goNext(module, false));
  };

  const setModuleGroup = async (module: LearnModule, groupNo: number) => {
    const activeGroup = getActiveGroup(module);
    const progressMap = module === 'vocab' ? vocabProgress : phraseProgress;
    const completed = Boolean(progressMap[groupNo]?.completedAt);
    if (!completed && groupNo !== activeGroup) return;

    const items = await ensureGroupItemsLoaded(module, groupNo);
    const queue = items.map((x) => x.id);
    const setEngine = module === 'vocab' ? setVocabEngine : setPhraseEngine;
    setEngine((prev) => ({
      ...prev,
      groupNo,
      step: 1,
      queue,
      index: 0,
      recognizeInput: '',
      fillSlots: [],
      fillCursor: 0,
      spellInput: '',
      recognizeOk: false,
    }));
    if (module === 'vocab') setVocabStepDonePrompt(null);
    else setPhraseStepDonePrompt(null);
    await ensureGroupStarted(module, groupNo);
  };

  useEffect(() => {
    if (vocabEngine.groupNo) ensureGroupItemsLoaded('vocab', vocabEngine.groupNo).then(() => {
      if (!vocabEngine.queue.length) {
        setVocabEngine((prev) => ({ ...prev, queue: buildQueueForGroup('vocab', prev.groupNo), index: 0 }));
      }
    });
  }, [vocabEngine.groupNo, JSON.stringify(vocabGroupSummary)]);

  useEffect(() => {
    if (phraseEngine.groupNo) ensureGroupItemsLoaded('phrase', phraseEngine.groupNo).then(() => {
      if (!phraseEngine.queue.length) {
        setPhraseEngine((prev) => ({ ...prev, queue: buildQueueForGroup('phrase', prev.groupNo), index: 0 }));
      }
    });
  }, [phraseEngine.groupNo, JSON.stringify(phraseGroupSummary)]);

  const switchStep = (module: LearnModule, step: StepNo) => {
    const setter = module === 'vocab' ? setVocabEngine : setPhraseEngine;
    setter((prev) => ({ ...prev, step, fillSlots: [], fillCursor: 0, spellInput: '', recognizeInput: '', recognizeOk: false }));
    if (module === 'vocab') setVocabStepDonePrompt((prev) => (prev === step ? null : prev));
    else setPhraseStepDonePrompt((prev) => (prev === step ? null : prev));
  };

  const handleFillSlotChange = (module: LearnModule, slotIndex: number, value: string, slotCount: number) => {
    const ch = value.replace(/[^a-zA-Z]/g, '').slice(-1);
    const setter = module === 'vocab' ? setVocabEngine : setPhraseEngine;
    setter((prev) => {
      const nextSlots = Array.from({ length: slotCount }, (_, i) => prev.fillSlots[i] || '');
      nextSlots[slotIndex] = ch;
      const nextCursor = ch ? Math.min(slotCount - 1, slotIndex + 1) : slotIndex;
      return { ...prev, fillSlots: nextSlots, fillCursor: nextCursor };
    });
    if (ch) {
      window.setTimeout(() => {
        fillInputRefs.current[Math.min(slotCount - 1, slotIndex + 1)]?.focus();
      }, 0);
    }
  };

  const handleFillSlotKeyDown = (module: LearnModule, slotIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      fillInputRefs.current[Math.max(0, slotIndex - 1)]?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      fillInputRefs.current[Math.min(fillInputRefs.current.length - 1, slotIndex + 1)]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleStep3Submit(module);
    }
  };

  const renderGroupChips = (module: LearnModule) => {
    const groups = module === 'vocab' ? vocabGroups : phraseGroups;
    const engine = module === 'vocab' ? vocabEngine : phraseEngine;
    const gp = module === 'vocab' ? vocabProgress : phraseProgress;
    const loadingMap = module === 'vocab' ? vocabLoadingGroups : phraseLoadingGroups;
    const activeGroup = getActiveGroup(module);

    return (
      <div className="flex flex-wrap gap-2 mb-4">
        {groups.map((g) => {
          const p = gp[g];
          const done = Boolean(p?.completedAt);
          const pending = !done && g !== activeGroup;
          const status = done ? `已完成 ${p?.durationSeconds || 0}s` : (g === activeGroup ? '进行中' : '待开始');
          return (
            <button
              key={g}
              disabled={pending}
              onClick={() => setModuleGroup(module, g)}
              className={cn(
                'px-3 py-1 rounded-full text-sm font-bold border disabled:cursor-not-allowed disabled:opacity-50',
                engine.groupNo === g ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant/40'
              )}
            >
              组 {g} {loadingMap[g] ? '· 加载中' : `· ${status}`}
            </button>
          );
        })}
      </div>
    );
  };
  const renderLearnModule = (module: LearnModule) => {
    const engine = module === 'vocab' ? vocabEngine : phraseEngine;
    const item = module === 'vocab' ? currentVocab : currentPhrase;
    const loadingGroup = module === 'vocab' ? vocabLoadingGroups[engine.groupNo] : phraseLoadingGroups[engine.groupNo];

    if (loadingGroup || loadingProgress) return <div className="text-sm text-on-surface-variant">正在加载词库...</div>;
    if (!item) return <div className="text-sm text-on-surface-variant">当前组暂无内容</div>;

    const options = getOptions(module, item);
    const blankIndexes = buildBlankIndexes(item.en);
    const fillSlots = Array.from({ length: blankIndexes.length }, (_, i) => engine.fillSlots[i] || '');
    const stepDonePrompt = module === 'vocab' ? vocabStepDonePrompt : phraseStepDonePrompt;

    const clearPrompt = () => {
      if (module === 'vocab') setVocabStepDonePrompt(null);
      else setPhraseStepDonePrompt(null);
    };

    const nextStep = (Math.min(4, engine.step + 1) as StepNo);

    if (stepDonePrompt && stepDonePrompt === engine.step && engine.stepDone[stepDonePrompt]) {
      return (
        <div className="space-y-6">
          {renderGroupChips(module)}
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h3 className="text-2xl font-black mb-2">本环节已完成</h3>
            <p className="text-sm text-on-surface-variant mb-4">可以切换查看已完成环节，或进入下一个环节。</p>
            <button
              onClick={() => {
                clearPrompt();
                switchStep(module, nextStep);
              }}
              className="px-4 py-2 rounded-lg bg-primary text-white font-bold"
            >
              进入下一个环节
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {renderGroupChips(module)}

        <div className="flex flex-wrap gap-2">
          {([
            { no: 1, label: '卡片认识' },
            { no: 2, label: '英译汉' },
            { no: 3, label: '补全' },
            { no: 4, label: '汉译英' },
          ] as Array<{ no: StepNo; label: string }>).map((s) => (
            <button
              key={s.no}
              onClick={() => {
                clearPrompt();
                switchStep(module, s.no);
              }}
              className={cn(
                'px-3 py-1 rounded-full text-sm font-bold border',
                engine.step === s.no ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant/40'
              )}
            >
              {s.label} {engine.stepDone[s.no] ? '· 已完成' : ''}
            </button>
          ))}
        </div>

        {engine.step === 1 && (
          <div className="bg-surface-container-low p-6 rounded-xl">
            <div className="flex items-center gap-4 mb-3">
              <h3 className="text-4xl font-black">{item.en}</h3>
              <button onClick={() => playAudio(item.wordAudio)} className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center" title="播放单词录音"><Volume2 className="w-5 h-5" /></button>
            </div>
            <p className="text-lg font-bold">{item.cn}</p>
            {item.phonetic && <p className="text-sm text-on-surface-variant mt-1">{item.phonetic}</p>}
            {item.sentence && (
              <div className="mt-4 flex items-center gap-2">
                <p className="text-base">{item.sentence}</p>
                <button onClick={() => playAudio(item.sentenceAudio)} className="w-8 h-8 rounded-full bg-secondary-container/70 flex items-center justify-center" title="播放例句录音"><Volume2 className="w-4 h-4" /></button>
              </div>
            )}
            {item.sentenceCn && <p className="text-sm text-on-surface-variant mt-1">{item.sentenceCn}</p>}
            <input
              value={engine.recognizeInput}
              onChange={(e) => handleRecognizeInput(module, e.target.value)}
              placeholder="自由拼写练习（不阻塞流程）"
              className="mt-4 w-full rounded-lg border border-outline-variant/40 px-3 py-2"
            />
            {engine.recognizeOk && <p className="mt-2 text-sm text-green-600 font-bold">正确</p>}
            <div className="mt-4 flex items-center gap-2">
              {engine.index > 0 && (
                <button onClick={() => goPrev(module)} className="px-4 py-2 rounded-lg border border-outline-variant/40 font-bold inline-flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> 上一题
                </button>
              )}
              <button onClick={() => goNext(module, false)} className="px-4 py-2 rounded-lg bg-primary text-white font-bold inline-flex items-center gap-1">
                下一题 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {engine.step === 2 && (
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h3 className="text-2xl font-black mb-4">{item.en} 的中文是？</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {options.map((opt) => (
                <button key={opt} onClick={() => handleStep2Choose(module, opt)} className="px-4 py-3 text-left rounded-lg bg-white hover:bg-primary-container/30 border border-outline-variant/30 font-bold">{opt}</button>
              ))}
            </div>
            {engine.index > 0 && (
              <div className="mt-4">
                <button onClick={() => goPrev(module)} className="px-4 py-2 rounded-lg border border-outline-variant/40 font-bold inline-flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> 上一题
                </button>
              </div>
            )}
          </div>
        )}

        {engine.step === 3 && (
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h3 className="text-2xl font-black mb-2">补全：{item.cn}</h3>
            <p className="text-sm text-on-surface-variant mb-3">对挖空字母补全，可用左右箭头切换空位，按 Enter 提交</p>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {item.phonetic ? (
                <span className="text-sm text-on-surface-variant">{item.phonetic}</span>
              ) : (
                <span className="text-sm text-on-surface-variant">-</span>
              )}
              <button
                onClick={() => playAudio(item.wordAudio)}
                className="w-8 h-8 rounded-full bg-secondary-container/70 flex items-center justify-center"
                title="播放发音"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {item.en.split('').map((ch, idx) => {
                const slotIndex = blankIndexes.indexOf(idx);
                if (slotIndex === -1) {
                  return <span key={`char-${idx}`} className="text-lg font-black px-1">{ch}</span>;
                }
                return (
                  <input
                    key={`slot-${idx}`}
                    ref={(el) => { fillInputRefs.current[slotIndex] = el; }}
                    value={fillSlots[slotIndex] || ''}
                    onChange={(e) => handleFillSlotChange(module, slotIndex, e.target.value, blankIndexes.length)}
                    onKeyDown={(e) => handleFillSlotKeyDown(module, slotIndex, e)}
                    maxLength={1}
                    className="w-10 h-10 text-center rounded-lg border border-outline-variant/40 bg-white font-black"
                  />
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleStep3Submit(module)} className="px-4 py-2 rounded-lg bg-primary text-white font-bold">提交</button>
              {engine.index > 0 && (
                <button onClick={() => goPrev(module)} className="px-4 py-2 rounded-lg border border-outline-variant/40 font-bold inline-flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> 上一题
                </button>
              )}
            </div>
          </div>
        )}

        {engine.step === 4 && (
          <div className="bg-surface-container-low p-6 rounded-xl">
            <h3 className="text-2xl font-black mb-2">汉译英：{item.cn}</h3>
            <p className="text-sm text-on-surface-variant mb-3">请输入英文（忽略大小写与多余空格），按 Enter 提交</p>
            <input
              value={engine.spellInput}
              onChange={(e) => (module === 'vocab' ? setVocabEngine((p) => ({ ...p, spellInput: e.target.value })) : setPhraseEngine((p) => ({ ...p, spellInput: e.target.value })))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleStep4Submit(module); } }}
              className="w-full rounded-lg border border-outline-variant/40 px-3 py-2"
            />
            <div className="mt-4 flex gap-2">
              <button onClick={() => handleStep4Submit(module)} className="px-4 py-2 rounded-lg bg-primary text-white font-bold">提交</button>
              {engine.index > 0 && (
                <button onClick={() => goPrev(module)} className="px-4 py-2 rounded-lg border border-outline-variant/40 font-bold inline-flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> 上一题
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex w-full">
      <aside className="w-64 fixed left-0 top-20 bottom-0 border-r-0 bg-emerald-50 hidden md:flex flex-col py-6 gap-2 z-40">
        <div className="px-8 mb-6">
          <h2 className="font-headline font-black text-xl text-yellow-600">学习中心</h2>
          <p className="text-xs font-semibold text-emerald-800/60">K-12 英语</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          <div onClick={() => navigate('/student/dashboard')} className="text-emerald-800 hover:bg-emerald-100 rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-semibold cursor-pointer"><LayoutDashboard className="w-5 h-5" /><span>控制面板</span></div>
          <div onClick={() => { navigate('/student/dashboard'); setTimeout(() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'phonetics' })), 100); }} className="text-emerald-800 hover:bg-emerald-100 rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-semibold cursor-pointer"><Mic2 className="w-5 h-5" /><span>音标学习</span></div>
          <div className="bg-yellow-400 text-yellow-950 rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-semibold"><Library className="w-5 h-5" /><span>单元学习</span></div>
          <div className="flex flex-col ml-12 mr-4 mb-2 border-l-2 border-emerald-200/50 pl-2 gap-1">
            <div onClick={() => setCurrentModule('vocab')} className={cn('rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2', currentModule === 'vocab' ? 'bg-emerald-200/50 text-emerald-900' : 'text-emerald-700/70 hover:bg-emerald-100/50')}><BookOpen className="w-4 h-4" />单词闯关</div>
            <div onClick={() => setCurrentModule('phrase')} className={cn('rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2', currentModule === 'phrase' ? 'bg-emerald-200/50 text-emerald-900' : 'text-emerald-700/70 hover:bg-emerald-100/50')}><MessageCircle className="w-4 h-4" />短语闯关</div>
            <div onClick={() => setCurrentModule('reading')} className={cn('rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2', currentModule === 'reading' ? 'bg-emerald-200/50 text-emerald-900' : 'text-emerald-700/70 hover:bg-emerald-100/50')}><Library className="w-4 h-4" />课文阅读</div>
            <div onClick={() => setCurrentModule('quiz')} className={cn('rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2', currentModule === 'quiz' ? 'bg-emerald-200/50 text-emerald-900' : 'text-emerald-700/70 hover:bg-emerald-100/50')}><FileQuestion className="w-4 h-4" />单元练习</div>
          </div>
          <div onClick={() => { navigate('/student/dashboard'); setTimeout(() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'word-tests' })), 100); }} className="text-emerald-800 hover:bg-emerald-100 rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-semibold cursor-pointer"><ClipboardList className="w-5 h-5" /><span>单词测试</span></div>
          <div onClick={() => { navigate('/student/dashboard'); setTimeout(() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'notebook' })), 100); }} className="text-emerald-800 hover:bg-emerald-100 rounded-full mx-4 mb-2 flex items-center gap-3 px-4 py-3 font-semibold cursor-pointer"><NotebookPen className="w-5 h-5" /><span>错题本</span></div>
        </nav>
        <div className="p-4 border-t border-outline-variant/20">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-error-container text-on-error-container rounded-xl font-bold hover:bg-error hover:text-white transition-colors"><LogOut className="w-5 h-5" />退出登录</button>
        </div>
      </aside>

      <main className="md:ml-64 flex-1 p-8 bg-background relative min-h-screen">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-end mb-8">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 mb-3 cursor-pointer" onClick={() => navigate('/student/dashboard')}><ArrowRight className="w-4 h-4 rotate-180" />返回控制面板</div>
              <h1 className="text-xl font-bold text-yellow-600 mb-2">Unit: {unitMeta?.unit || unitId}</h1>
              <h2 className="text-4xl font-black text-on-background">{currentModule === 'vocab' ? '单词闯关' : currentModule === 'phrase' ? '短语闯关' : currentModule === 'reading' ? '课文阅读' : '单元练习'}</h2>
              {unitMeta && <p className="mt-2 text-sm text-on-surface-variant">{unitMeta.bookVersion} · {unitMeta.grade} · {unitMeta.semester}</p>}
            </div>
          </div>

          {pageError && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{pageError}</div>}

          <div className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border-b-4 border-surface-container min-h-[420px]">
            {currentModule === 'vocab' && renderLearnModule('vocab')}
            {currentModule === 'phrase' && renderLearnModule('phrase')}
            {currentModule === 'reading' && (
              <div>
                <h3 className="text-2xl font-black mb-3">{MOCK_READING.title}</h3>
                <p className="text-lg leading-relaxed">{MOCK_READING.content}</p>
              </div>
            )}
            {currentModule === 'quiz' && (
              <div className="space-y-4">
                {MOCK_QUIZ.map((q) => <div key={q.id} className="bg-surface-container-low p-4 rounded-lg"><p className="font-bold">{q.question}</p></div>)}
                <p className="text-sm text-on-surface-variant">单元练习模块后续继续完善。</p>
              </div>
            )}
          </div>
        </div>
        {showError && (
          <div className="absolute inset-0 z-50 bg-error/85 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8">
            <XCircle className="w-16 h-16 mb-4" />
            <h2 className="text-4xl font-black mb-2">回答错误</h2>
            <p className="text-xl">正确词条：{errorLabel}</p>
            <p className="mt-4 text-sm opacity-90">已触发熔断：下一题立刻重考，并在队尾再出现一次</p>
          </div>
        )}

        {showCorrect && (
          <div className="absolute inset-0 z-40 bg-green-600/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8">
            <h2 className="text-4xl font-black mb-2">回答正确</h2>
            <p className="text-lg">即将进入下一题</p>
          </div>
        )}
        <button className="fixed bottom-10 right-10 w-16 h-16 bg-primary-fixed text-on-primary-fixed rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-all z-40 group"><HelpCircle className="w-8 h-8 transition-transform group-hover:rotate-12" /></button>
      </main>
    </div>
  );
};
