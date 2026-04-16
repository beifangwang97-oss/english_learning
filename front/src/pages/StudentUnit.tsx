import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MOCK_QUIZ } from '../data/mock';
import { useAuth } from '../context/AuthContext';
import { useTimer } from '../context/TimerContext';
import { cn } from '../lib/utils';
import { learningProgressApi } from '../lib/auth';
import { formatPassageDisplayLabel, formatSourceTagLabel, lexiconApi, LearningEntry, LearningGroupSummary, LearningSourceGroupSummary, PassageItem } from '../lib/lexicon';
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

type ReadingSessionState = {
  passageNo: number;
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
const DEFAULT_SOURCE_ORDER = ['current_book', 'primary_school_review'];

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

function pickDefaultSourceTag(sourceGroups: LearningSourceGroupSummary[]) {
  for (const sourceTag of DEFAULT_SOURCE_ORDER) {
    if (sourceGroups.some((row) => row.sourceTag === sourceTag)) return sourceTag;
  }
  return sourceGroups[0]?.sourceTag || 'current_book';
}

function buildSourceGroupKey(sourceTag: string, groupNo: number) {
  return `${sourceTag}||${groupNo}`;
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
  const [vocabSourceGroups, setVocabSourceGroups] = useState<LearningSourceGroupSummary[]>([]);
  const [phraseSourceGroups, setPhraseSourceGroups] = useState<LearningSourceGroupSummary[]>([]);
  const [selectedVocabSourceTag, setSelectedVocabSourceTag] = useState('current_book');
  const [selectedPhraseSourceTag, setSelectedPhraseSourceTag] = useState('current_book');

  const [vocabProgress, setVocabProgress] = useState<Record<string, GroupProgressView>>({});
  const [phraseProgress, setPhraseProgress] = useState<Record<string, GroupProgressView>>({});

  const [vocabGroupSummary, setVocabGroupSummary] = useState<LearningGroupSummary[]>([]);
  const [phraseGroupSummary, setPhraseGroupSummary] = useState<LearningGroupSummary[]>([]);

  const [vocabGroupItems, setVocabGroupItems] = useState<Record<string, LearnItem[]>>({});
  const [phraseGroupItems, setPhraseGroupItems] = useState<Record<string, LearnItem[]>>({});
  const [vocabLoadingGroups, setVocabLoadingGroups] = useState<Record<string, boolean>>({});
  const [phraseLoadingGroups, setPhraseLoadingGroups] = useState<Record<string, boolean>>({});
  const [readingItems, setReadingItems] = useState<PassageItem[]>([]);
  const [readingIndex, setReadingIndex] = useState(0);
  const [readingProgress, setReadingProgress] = useState<Record<number, GroupProgressView>>({});
  const [readingSessionLoaded, setReadingSessionLoaded] = useState(false);
  const [showFullTranslation, setShowFullTranslation] = useState(false);
  const [sentencePopover, setSentencePopover] = useState<{ idx: number; left: number; top: number } | null>(null);
  const [playingSentenceNo, setPlayingSentenceNo] = useState<number | null>(null);
  const [playingFullPassage, setPlayingFullPassage] = useState(false);

  const recognizeClearTimerRef = useRef<number | null>(null);
  const vocabSessionSaveRef = useRef<number | null>(null);
  const phraseSessionSaveRef = useRef<number | null>(null);
  const readingSessionSaveRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopReadingAudioRef = useRef<(() => void) | null>(null);
  const readingTextWrapRef = useRef<HTMLDivElement | null>(null);
  const fillInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const correctTimerRef = useRef<number | null>(null);

  const vocabItemMap = useMemo(() => new Map(Object.values(vocabGroupItems).flat().map((x) => [x.id, x])), [vocabGroupItems]);
  const phraseItemMap = useMemo(() => new Map(Object.values(phraseGroupItems).flat().map((x) => [x.id, x])), [phraseGroupItems]);

  const vocabGroups = useMemo(() => vocabGroupSummary.map((x) => x.groupNo), [vocabGroupSummary]);
  const phraseGroups = useMemo(() => phraseGroupSummary.map((x) => x.groupNo), [phraseGroupSummary]);
  const vocabSourceOptions = useMemo(() => vocabSourceGroups.map((row) => row.sourceTag), [vocabSourceGroups]);
  const phraseSourceOptions = useMemo(() => phraseSourceGroups.map((row) => row.sourceTag), [phraseSourceGroups]);

  const getModuleSourceTag = (module: LearnModule) => (module === 'vocab' ? selectedVocabSourceTag : selectedPhraseSourceTag);
  const getModuleUnitId = (module: LearnModule, sourceTag?: string) => {
    const resolvedSourceTag = sourceTag || getModuleSourceTag(module);
    return `${unitId}||${resolvedSourceTag}`;
  };

  const getActiveGroup = (module: LearnModule): number => {
    const groups = module === 'vocab' ? vocabGroups : phraseGroups;
    const progress = module === 'vocab' ? vocabProgress : phraseProgress;
    const sourceTag = getModuleSourceTag(module);
    const firstPending = groups.find((g) => !progress[buildSourceGroupKey(sourceTag, g)]?.completedAt);
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
  const readingPassages = useMemo(
    () => readingItems.filter((x) => normalizeText(x.unit || '') === normalizeText(unitMeta?.unit || '')),
    [readingItems, unitMeta?.unit]
  );
  const currentPassage = readingPassages[readingIndex] || null;

  const ensureGroupItemsLoaded = async (module: LearnModule, groupNo: number, sourceTagOverride?: string): Promise<LearnItem[]> => {
    if (!token || !unitMeta) return [];
    const sourceTag = sourceTagOverride || getModuleSourceTag(module);
    const cacheKey = buildSourceGroupKey(sourceTag, groupNo);
    if (module === 'vocab') {
      if (vocabGroupItems[cacheKey]) return vocabGroupItems[cacheKey];
      if (vocabLoadingGroups[cacheKey]) return [];
      setVocabLoadingGroups((prev) => ({ ...prev, [cacheKey]: true }));
      try {
        const payload = await lexiconApi.getLearningItemsByGroup(token, {
          type: 'word',
          bookVersion: unitMeta.bookVersion,
          grade: unitMeta.grade,
          semester: unitMeta.semester,
          unit: unitMeta.unit,
          sourceTag,
          groupNo,
        });
        const mapped = payload.items.map(mapEntryToLearnItem);
        setVocabGroupItems((prev) => ({ ...prev, [cacheKey]: mapped }));
        return mapped;
      } finally {
        setVocabLoadingGroups((prev) => ({ ...prev, [cacheKey]: false }));
      }
      return [];
    }

    if (phraseGroupItems[cacheKey]) return phraseGroupItems[cacheKey];
    if (phraseLoadingGroups[cacheKey]) return [];
    setPhraseLoadingGroups((prev) => ({ ...prev, [cacheKey]: true }));
    try {
      const payload = await lexiconApi.getLearningItemsByGroup(token, {
        type: 'phrase',
        bookVersion: unitMeta.bookVersion,
        grade: unitMeta.grade,
        semester: unitMeta.semester,
        unit: unitMeta.unit,
        sourceTag,
        groupNo,
      });
      const mapped = payload.items.map(mapEntryToLearnItem);
      setPhraseGroupItems((prev) => ({ ...prev, [cacheKey]: mapped }));
      return mapped;
    } finally {
      setPhraseLoadingGroups((prev) => ({ ...prev, [cacheKey]: false }));
    }
    return [];
  };

  const buildQueueForGroup = (module: LearnModule, groupNo: number): string[] => {
    const sourceTag = getModuleSourceTag(module);
    const cacheKey = buildSourceGroupKey(sourceTag, groupNo);
    const items = module === 'vocab' ? (vocabGroupItems[cacheKey] || []) : (phraseGroupItems[cacheKey] || []);
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

        const [wordSummary, phraseSummary, passagesPayload, rSession, rGp] = await Promise.all([
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
          lexiconApi.getPassages(token, unitMeta.bookVersion, unitMeta.grade, unitMeta.semester),
          learningProgressApi.getSession(token, uid, unitId, 'reading'),
          learningProgressApi.getGroupProgress(token, uid, unitId, 'reading'),
        ]);

        const nextVocabSourceGroups = wordSummary.sourceGroups || [];
        const nextPhraseSourceGroups = phraseSummary.sourceGroups || [];
        setVocabSourceGroups(nextVocabSourceGroups);
        setPhraseSourceGroups(nextPhraseSourceGroups);
        const nextVocabSourceTag = nextVocabSourceGroups.some((row) => row.sourceTag === selectedVocabSourceTag)
          ? selectedVocabSourceTag
          : pickDefaultSourceTag(nextVocabSourceGroups);
        const nextPhraseSourceTag = nextPhraseSourceGroups.some((row) => row.sourceTag === selectedPhraseSourceTag)
          ? selectedPhraseSourceTag
          : pickDefaultSourceTag(nextPhraseSourceGroups);
        setSelectedVocabSourceTag(nextVocabSourceTag);
        setSelectedPhraseSourceTag(nextPhraseSourceTag);
        setVocabGroupSummary(nextVocabSourceGroups.find((row) => row.sourceTag === nextVocabSourceTag)?.groups || []);
        setPhraseGroupSummary(nextPhraseSourceGroups.find((row) => row.sourceTag === nextPhraseSourceTag)?.groups || []);
        setVocabProgress({});
        setPhraseProgress({});
        setVocabGroupItems({});
        setPhraseGroupItems({});
        setVocabEngine(defaultEngine());
        setPhraseEngine(defaultEngine());

        const rMap: Record<number, GroupProgressView> = {};
        rGp.forEach((x) => { rMap[x.groupNo] = x; });
        setReadingProgress(rMap);

        const allPassages = passagesPayload.items || [];
        const unitPassages = allPassages.filter((x) => normalizeText(x.unit || '') === normalizeText(unitMeta.unit));
        setReadingItems(allPassages);

        let readingSaved: ReadingSessionState | null = null;
        try {
          if (rSession?.stateJson) readingSaved = JSON.parse(rSession.stateJson) as ReadingSessionState;
        } catch {
          readingSaved = null;
        }

        const savedPassageNo = Number(readingSaved?.passageNo || 1);
        const nextReadingIndex = Math.min(Math.max(0, savedPassageNo - 1), Math.max(0, unitPassages.length - 1));
        setReadingIndex(nextReadingIndex);
        setReadingSessionLoaded(true);
      } catch (e: any) {
        setPageError(e?.message || '词库加载失败');
      } finally {
        setLoadingProgress(false);
      }
    };
    load();
  }, [token, user?.id, unitId, unitMeta?.bookVersion, unitMeta?.grade, unitMeta?.semester, unitMeta?.unit]);

  useEffect(() => {
    const hydrateModule = async () => {
      if (!token || !user?.id || !unitMeta || !selectedVocabSourceTag) return;
      const sourceRow = vocabSourceGroups.find((row) => row.sourceTag === selectedVocabSourceTag);
      const groups = sourceRow?.groups || [];
      setVocabGroupSummary(groups);
      setVocabProgress({});
      setVocabGroupItems({});
      if (groups.length === 0) {
        setVocabEngine(defaultEngine());
        return;
      }
      const savedSession = await learningProgressApi.getSession(token, Number(user.id), getModuleUnitId('vocab', selectedVocabSourceTag), 'vocab').catch(() => null);
      const groupRows = await learningProgressApi.getGroupProgress(token, Number(user.id), getModuleUnitId('vocab', selectedVocabSourceTag), 'vocab').catch(() => []);
      const nextProgress: Record<string, GroupProgressView> = {};
      (groupRows || []).forEach((x: any) => { nextProgress[buildSourceGroupKey(selectedVocabSourceTag, x.groupNo)] = x; });
      setVocabProgress(nextProgress);
      const saved = safeParseSession(savedSession?.stateJson);
      const groupNos = groups.map((x) => Number(x.groupNo)).filter((x) => x > 0);
      const savedGroup = Number(saved?.groupNo || 0);
      const nextGroup = groupNos.includes(savedGroup) ? savedGroup : (groupNos[0] || 1);
      const items = await ensureGroupItemsLoaded('vocab', nextGroup, selectedVocabSourceTag);
      const baseQueue = items.map((x) => x.id);
      const queue = normalizeQueue(Array.isArray(saved?.queue) ? (saved.queue as string[]) : [], baseQueue);
      const index = Math.min(Math.max(0, Number(saved?.index || 0)), Math.max(0, queue.length - 1));
      setVocabEngine((prev) => ({
        ...prev,
        groupNo: nextGroup,
        step: (Number(saved?.step || 1) as StepNo),
        queue,
        index,
        stepDone: (saved?.stepDone as Record<number, boolean>) || {},
      }));
    };
    hydrateModule().catch(() => {});
  }, [token, user?.id, unitMeta?.bookVersion, unitMeta?.grade, unitMeta?.semester, unitMeta?.unit, selectedVocabSourceTag, JSON.stringify(vocabSourceGroups)]);

  useEffect(() => {
    const hydrateModule = async () => {
      if (!token || !user?.id || !unitMeta || !selectedPhraseSourceTag) return;
      const sourceRow = phraseSourceGroups.find((row) => row.sourceTag === selectedPhraseSourceTag);
      const groups = sourceRow?.groups || [];
      setPhraseGroupSummary(groups);
      setPhraseProgress({});
      setPhraseGroupItems({});
      if (groups.length === 0) {
        setPhraseEngine(defaultEngine());
        return;
      }
      const savedSession = await learningProgressApi.getSession(token, Number(user.id), getModuleUnitId('phrase', selectedPhraseSourceTag), 'phrase').catch(() => null);
      const groupRows = await learningProgressApi.getGroupProgress(token, Number(user.id), getModuleUnitId('phrase', selectedPhraseSourceTag), 'phrase').catch(() => []);
      const nextProgress: Record<string, GroupProgressView> = {};
      (groupRows || []).forEach((x: any) => { nextProgress[buildSourceGroupKey(selectedPhraseSourceTag, x.groupNo)] = x; });
      setPhraseProgress(nextProgress);
      const saved = safeParseSession(savedSession?.stateJson);
      const groupNos = groups.map((x) => Number(x.groupNo)).filter((x) => x > 0);
      const savedGroup = Number(saved?.groupNo || 0);
      const nextGroup = groupNos.includes(savedGroup) ? savedGroup : (groupNos[0] || 1);
      const items = await ensureGroupItemsLoaded('phrase', nextGroup, selectedPhraseSourceTag);
      const baseQueue = items.map((x) => x.id);
      const queue = normalizeQueue(Array.isArray(saved?.queue) ? (saved.queue as string[]) : [], baseQueue);
      const index = Math.min(Math.max(0, Number(saved?.index || 0)), Math.max(0, queue.length - 1));
      setPhraseEngine((prev) => ({
        ...prev,
        groupNo: nextGroup,
        step: (Number(saved?.step || 1) as StepNo),
        queue,
        index,
        stepDone: (saved?.stepDone as Record<number, boolean>) || {},
      }));
    };
    hydrateModule().catch(() => {});
  }, [token, user?.id, unitMeta?.bookVersion, unitMeta?.grade, unitMeta?.semester, unitMeta?.unit, selectedPhraseSourceTag, JSON.stringify(phraseSourceGroups)]);

  useEffect(() => {
    if (phraseSourceGroups.length === 0) return;
    const preferred = pickDefaultSourceTag(phraseSourceGroups);
    if (selectedPhraseSourceTag !== preferred) {
      setSelectedPhraseSourceTag(preferred);
    }
  }, [selectedPhraseSourceTag, JSON.stringify(phraseSourceGroups)]);

  const ensureGroupStarted = async (module: LearnModule, groupNo: number) => {
    if (!token || !user?.id || !unitId) return;
    const progressMap = module === 'vocab' ? vocabProgress : phraseProgress;
    const progressKey = buildSourceGroupKey(getModuleSourceTag(module), groupNo);
    if (progressMap[progressKey]?.startedAt) return;

    const total = module === 'vocab'
      ? (vocabGroupSummary.find((x) => x.groupNo === groupNo)?.count || 0)
      : (phraseGroupSummary.find((x) => x.groupNo === groupNo)?.count || 0);

    const saved = await learningProgressApi.startGroup(token, {
      userId: Number(user.id), unitId: getModuleUnitId(module), module, groupNo, itemTotal: total,
    });
    if (module === 'vocab') setVocabProgress((prev) => ({ ...prev, [progressKey]: saved }));
    else setPhraseProgress((prev) => ({ ...prev, [progressKey]: saved }));
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
          userId: Number(user.id), unitId: getModuleUnitId('vocab'), module: 'vocab', stateJson: payload,
        }).catch(() => {});
      }, 500);
      return;
    }

    if (phraseSessionSaveRef.current) window.clearTimeout(phraseSessionSaveRef.current);
    phraseSessionSaveRef.current = window.setTimeout(() => {
      learningProgressApi.upsertSession(token, {
        userId: Number(user.id), unitId: getModuleUnitId('phrase'), module: 'phrase', stateJson: payload,
      }).catch(() => {});
    }, 500);
  };

  useEffect(() => {
    if (!loadingProgress) scheduleSaveSession('vocab', vocabEngine);
  }, [vocabEngine.groupNo, vocabEngine.step, vocabEngine.queue, vocabEngine.index, loadingProgress]);

  useEffect(() => {
    if (!loadingProgress) scheduleSaveSession('phrase', phraseEngine);
  }, [phraseEngine.groupNo, phraseEngine.step, phraseEngine.queue, phraseEngine.index, loadingProgress]);

  useEffect(() => {
    if (!token || !user?.id || !unitId || !readingSessionLoaded) return;
    if (readingSessionSaveRef.current) window.clearTimeout(readingSessionSaveRef.current);
    readingSessionSaveRef.current = window.setTimeout(() => {
      learningProgressApi.upsertSession(token, {
        userId: Number(user.id),
        unitId,
        module: 'reading',
        stateJson: JSON.stringify({ passageNo: readingIndex + 1 }),
      }).catch(() => {});
    }, 400);
  }, [token, user?.id, unitId, readingIndex, readingSessionLoaded]);

  useEffect(() => {
    setSentencePopover(null);
    setShowFullTranslation(false);
    stopReadingPlayback();
    if (!token || !user?.id || !unitId || !currentPassage) return;
    const groupNo = readingIndex + 1;
    if (readingProgress[groupNo]?.startedAt) return;
    learningProgressApi.startGroup(token, {
      userId: Number(user.id),
      unitId,
      module: 'reading',
      groupNo,
      itemTotal: currentPassage.sentences?.length || 0,
    }).then((saved) => {
      setReadingProgress((prev) => ({ ...prev, [groupNo]: saved }));
    }).catch(() => {});
  }, [currentPassage?.id, readingIndex, token, user?.id, unitId]);

  useEffect(() => {
    if (showFullTranslation) setSentencePopover(null);
  }, [showFullTranslation]);

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
        userId: Number(user.id), unitId: getModuleUnitId(module), module, groupNo, itemTotal: total, learnedCount: total,
      });
      const progressKey = buildSourceGroupKey(getModuleSourceTag(module), groupNo);
      if (module === 'vocab') setVocabProgress((prev) => ({ ...prev, [progressKey]: saved }));
      else setPhraseProgress((prev) => ({ ...prev, [progressKey]: saved }));
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

  const playAudioAwaitEnd = async (path: string): Promise<void> => {
    if (!token || !path) return;
    const response = await fetch(lexiconApi.audioUrl(path), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('audio load failed');

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(objectUrl);
      currentAudioRef.current = audio;
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };
      audio.addEventListener('ended', () => {
        cleanup();
        resolve();
      }, { once: true });
      audio.addEventListener('error', () => {
        cleanup();
        reject(new Error('audio playback error'));
      }, { once: true });
      audio.play().catch((e) => {
        cleanup();
        reject(e);
      });
    });
  };

  const stopReadingPlayback = () => {
    if (stopReadingAudioRef.current) {
      stopReadingAudioRef.current();
      stopReadingAudioRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setPlayingSentenceNo(null);
    setPlayingFullPassage(false);
  };

  const playSentenceAudio = async (audioPath?: string, sentenceNo?: number) => {
    if (!audioPath) return;
    stopReadingPlayback();
    setPlayingSentenceNo(sentenceNo ?? null);
    try {
      await playAudioAwaitEnd(audioPath);
    } catch {
      // ignore sentence audio error
    } finally {
      setPlayingSentenceNo(null);
    }
  };

  const toggleSentencePopover = (e: React.MouseEvent<HTMLButtonElement>, idx: number) => {
    if (showFullTranslation) return;
    if (sentencePopover?.idx === idx) {
      setSentencePopover(null);
      return;
    }

    const wrap = readingTextWrapRef.current;
    if (!wrap) {
      setSentencePopover({ idx, left: 160, top: 40 });
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const cardWidth = 320;
    const edge = 12;
    const half = cardWidth / 2;
    let left = btnRect.left - wrapRect.left + (btnRect.width / 2);
    left = Math.max(edge + half, Math.min(wrap.clientWidth - edge - half, left));
    const top = Math.max(8, btnRect.bottom - wrapRect.top + 8);
    setSentencePopover({ idx, left, top });
  };

  const playFullPassageAudio = async () => {
    if (!currentPassage) return;
    const queue = (currentPassage.sentences || []).filter((x) => Boolean(x.audio));
    if (!queue.length) return;

    stopReadingPlayback();
    let cancelled = false;
    stopReadingAudioRef.current = () => { cancelled = true; };
    setPlayingFullPassage(true);

    try {
      for (let i = 0; i < queue.length; i += 1) {
        if (cancelled) break;
        setPlayingSentenceNo(i);
        await playAudioAwaitEnd(queue[i].audio);
      }
    } catch {
      // ignore full passage audio error
    } finally {
      setPlayingSentenceNo(null);
      setPlayingFullPassage(false);
      stopReadingAudioRef.current = null;
    }
  };

  const markCurrentPassageDone = async () => {
    if (!token || !user?.id || !unitId || !currentPassage) return;
    const groupNo = readingIndex + 1;
    try {
      const started = await learningProgressApi.startGroup(token, {
        userId: Number(user.id),
        unitId,
        module: 'reading',
        groupNo,
        itemTotal: currentPassage.sentences?.length || 0,
      });
      const done = await learningProgressApi.completeGroup(token, {
        userId: Number(user.id),
        unitId,
        module: 'reading',
        groupNo,
        itemTotal: currentPassage.sentences?.length || 0,
        learnedCount: currentPassage.sentences?.length || 0,
      });
      setReadingProgress((prev) => ({
        ...prev,
        [groupNo]: done || started,
      }));
    } catch {
      // ignore mark done error
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
    const completed = Boolean(progressMap[buildSourceGroupKey(getModuleSourceTag(module), groupNo)]?.completedAt);
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
    const sourceOptions = module === 'vocab' ? vocabSourceOptions : [];
    const selectedSourceTag = getModuleSourceTag(module);

    return (
      <div className="mb-4 space-y-3">
        {module === 'vocab' && sourceOptions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {sourceOptions.map((sourceTag) => (
              <button
                key={`${module}-${sourceTag}`}
                onClick={() => {
                  if (module === 'vocab') setSelectedVocabSourceTag(sourceTag);
                  else setSelectedPhraseSourceTag(sourceTag);
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-bold',
                  selectedSourceTag === sourceTag ? 'border-primary bg-primary text-white' : 'border-outline-variant/40 bg-white'
                )}
              >
                {formatSourceTagLabel(sourceTag)}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const stateKey = buildSourceGroupKey(selectedSourceTag, g);
          const p = gp[stateKey];
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
              组 {g} {loadingMap[stateKey] ? '· 加载中' : `· ${status}`}
            </button>
          );
        })}
        </div>
      </div>
    );
  };
  const renderLearnModule = (module: LearnModule) => {
    const engine = module === 'vocab' ? vocabEngine : phraseEngine;
    const item = module === 'vocab' ? currentVocab : currentPhrase;
    const sourceTag = getModuleSourceTag(module);
    const loadingGroup = module === 'vocab'
      ? vocabLoadingGroups[buildSourceGroupKey(sourceTag, engine.groupNo)]
      : phraseLoadingGroups[buildSourceGroupKey(sourceTag, engine.groupNo)];

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

  const renderReadingModule = () => {
    if (loadingProgress) return <div className="text-sm text-on-surface-variant">正在加载课文...</div>;
    if (!readingPassages.length) {
      return <div className="text-sm text-on-surface-variant">本单元暂未配置课文内容</div>;
    }
    if (!currentPassage) return null;

    const done = Boolean(readingProgress[readingIndex + 1]?.completedAt);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {readingPassages.map((item, idx) => {
            const itemDone = Boolean(readingProgress[idx + 1]?.completedAt);
            return (
              <button
                key={item.id}
                onClick={() => setReadingIndex(idx)}
                className={cn(
                  'px-3 py-1 rounded-full text-sm font-bold border',
                  idx === readingIndex ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant/40'
                )}
              >
                {`Section ${item.section} ${formatPassageDisplayLabel(item)}`} {itemDone ? '· 已学完' : ''}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-cyan-50 border border-emerald-200/60 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-emerald-700">
                {currentPassage.unit} · Section {currentPassage.section} · {formatPassageDisplayLabel(currentPassage)}
              </p>
              {currentPassage.title && <h3 className="text-2xl font-black mt-1">{currentPassage.title}</h3>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowFullTranslation((prev) => !prev)}
                className="px-3 py-2 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-sm font-bold"
              >
                {showFullTranslation ? '收起整篇译文' : '显示整篇译文'}
              </button>
              <button
                onClick={() => (playingFullPassage ? stopReadingPlayback() : playFullPassageAudio())}
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1"
              >
                <Volume2 className="w-4 h-4" />
                {playingFullPassage ? '停止整篇播放' : '播放整篇音频'}
              </button>
            </div>
          </div>
        </div>

        <div
          ref={readingTextWrapRef}
          className={cn(
            'relative rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/50 to-white p-6 md:p-8 shadow-sm',
            showFullTranslation && 'md:-mx-10 xl:-mx-20 2xl:-mx-28'
          )}
        >
          <div className={cn('items-start', showFullTranslation ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8' : 'block')}>
            <section className={cn('min-w-0', showFullTranslation && 'rounded-xl border border-amber-200/70 bg-white/70 p-4 md:p-5')}>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-amber-700">English</p>
              <article className="text-[19px] leading-[2.1] text-slate-900 font-serif tracking-[0.01em]">
                {currentPassage.sentences.map((sentence, idx) => (
                  <span key={`${currentPassage.id}-en-${idx}`} className="inline">
                    {sentence.en}
                    <button
                      onClick={() => playSentenceAudio(sentence.audio, idx)}
                      disabled={!sentence.audio}
                      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300 text-amber-700 align-middle opacity-80 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="播放本句"
                    >
                      <Volume2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => toggleSentencePopover(e, idx)}
                      className={cn(
                        'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black align-middle',
                        sentencePopover?.idx === idx ? 'bg-amber-300 text-amber-900' : 'bg-amber-100 text-amber-800'
                      )}
                      title="显示本句译文"
                    >
                      译
                    </button>{' '}
                    {(Number(sentence.newline_after ?? (sentence.is_paragraph_end ? 2 : 0)) >= 1) && (
                      <>
                        <br />
                        {(Number(sentence.newline_after ?? (sentence.is_paragraph_end ? 2 : 0)) >= 2) && <br />}
                      </>
                    )}
                  </span>
                ))}
              </article>
            </section>

            {showFullTranslation && (
              <section className="min-w-0 rounded-xl border border-slate-200 bg-white/80 p-4 md:p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">中文译文</p>
                <article className="text-[19px] leading-[2.1] text-slate-700 tracking-[0.01em]">
                  {currentPassage.sentences.map((sentence, idx) => (
                    <span key={`${currentPassage.id}-zh-${idx}`} className="inline">
                      {sentence.zh}
                      {(Number(sentence.newline_after ?? (sentence.is_paragraph_end ? 2 : 0)) >= 1) && (
                        <>
                          <br />
                          {(Number(sentence.newline_after ?? (sentence.is_paragraph_end ? 2 : 0)) >= 2) && <br />}
                        </>
                      )}
                    </span>
                  ))}
                </article>
              </section>
            )}
          </div>

          {!showFullTranslation && sentencePopover && currentPassage.sentences[sentencePopover.idx] && (
            <div
              className="absolute z-20 w-[320px] max-w-[calc(100%-24px)] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
              style={{ left: sentencePopover.left, top: sentencePopover.top, transform: 'translate(-50%, 0)' }}
            >
              <p className="text-xs font-bold text-slate-500 mb-1">当前句译文</p>
              <p className="text-sm leading-6 text-slate-700">
                {currentPassage.sentences[sentencePopover.idx].zh}
              </p>
            </div>
          )}

          {playingSentenceNo !== null && (
            <div className="mt-4 text-xs text-emerald-700 font-bold">
              正在播放第 {playingSentenceNo + 1} 句
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
          <div className="flex gap-2">
            <button
              onClick={() => setReadingIndex((prev) => Math.max(0, prev - 1))}
              disabled={readingIndex <= 0}
              className="px-4 py-2 rounded-lg border border-outline-variant/40 font-bold inline-flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> 上一篇
            </button>
            <button
              onClick={() => setReadingIndex((prev) => Math.min(readingPassages.length - 1, prev + 1))}
              disabled={readingIndex >= readingPassages.length - 1}
              className="px-4 py-2 rounded-lg border border-outline-variant/40 font-bold inline-flex items-center gap-1 disabled:opacity-40"
            >
              下一篇 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={markCurrentPassageDone}
            className={cn(
              'px-4 py-2 rounded-lg font-bold',
              done ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-primary text-white'
            )}
          >
            {done ? '本篇已学完' : '点击本篇已学完'}
          </button>
        </div>
      </div>
    );
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => () => {
    stopReadingPlayback();
    if (readingSessionSaveRef.current) window.clearTimeout(readingSessionSaveRef.current);
  }, []);

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
        <div className={cn('mx-auto', currentModule === 'reading' && showFullTranslation ? 'max-w-[1700px]' : 'max-w-5xl')}>
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
            {currentModule === 'reading' && renderReadingModule()}
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





