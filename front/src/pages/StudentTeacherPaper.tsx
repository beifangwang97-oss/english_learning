import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Send,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTimer } from '../context/TimerContext';
import {
  studentTeacherExamApi,
  StudentTeacherExamAssignment,
  StudentTeacherExamResultItem,
  TeacherExamPaperSectionItem,
} from '../lib/auth';
import { getSessionToken } from '../lib/session';

type AnswerMap = Record<string, any>;

type FlattenedQuestion = {
  key: string;
  sectionId: number;
  sectionTitle: string;
  sectionQuestionType: string;
  sectionItemId: number;
  itemType: 'question' | 'group';
  questionId?: number | null;
  questionUid?: string;
  questionNo?: number | null;
  questionType: string;
  stem?: string;
  sharedStem?: string;
  material?: string;
  options?: Array<{ key: string; text: string }>;
  correctAnswer: any;
  analysis?: string;
  sourceFile?: string;
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: '单项选择',
  multiple_choice: '多项选择',
  cloze: '完形填空',
  reading: '阅读理解',
  seven_choice: '七选五',
};

function questionTypeLabel(value?: string) {
  if (!value) return '题目';
  return QUESTION_TYPE_LABELS[value] || value;
}

function normalizeAnswerScalar(value: any) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, '').trim().toLowerCase();
}

function normalizeAnswerList(value: any) {
  if (Array.isArray(value)) {
    return value.map(normalizeAnswerScalar).filter(Boolean);
  }
  const scalar = normalizeAnswerScalar(value);
  if (!scalar) return [];
  return scalar
    .split(/[,|/;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isCorrectAnswer(submitted: any, correct: any, questionType: string) {
  if (questionType === 'multiple_choice') {
    const left = [...normalizeAnswerList(submitted)].sort();
    const right = [...normalizeAnswerList(correct)].sort();
    return JSON.stringify(left) === JSON.stringify(right);
  }
  if (Array.isArray(submitted) || Array.isArray(correct)) {
    return JSON.stringify(normalizeAnswerList(submitted)) === JSON.stringify(normalizeAnswerList(correct));
  }
  return normalizeAnswerScalar(submitted) === normalizeAnswerScalar(correct);
}

function answerDisplay(value: any) {
  if (value == null || value === '') return '-';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function questionKey(questionUid?: string, questionId?: number | null, fallback?: string) {
  if (questionUid) return questionUid;
  if (typeof questionId === 'number') return `qid:${questionId}`;
  return fallback || 'unknown';
}

function flattenPaper(assignment: StudentTeacherExamAssignment): FlattenedQuestion[] {
  const rows: FlattenedQuestion[] = [];
  for (const section of assignment.paper.sections || []) {
    for (const item of section.items || []) {
      const snapshot = item.snapshot || {};
      if (item.itemType === 'group') {
        const questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
        for (let index = 0; index < questions.length; index += 1) {
          const question = questions[index] || {};
          rows.push({
            key: questionKey(question.questionUid, question.questionId, `${section.id}-${item.id}-${index}`),
            sectionId: section.id,
            sectionTitle: section.sectionTitle,
            sectionQuestionType: section.questionType,
            sectionItemId: item.id,
            itemType: 'group',
            questionId: question.questionId,
            questionUid: question.questionUid,
            questionNo: question.questionNo,
            questionType: question.questionType || section.questionType,
            stem: question.stem,
            sharedStem: snapshot.sharedStem || question.sharedStem,
            material: snapshot.material || question.material,
            options: Array.isArray(question.options) ? question.options : [],
            correctAnswer: question.answer,
            analysis: question.analysis,
            sourceFile: question.sourceFile || snapshot.sourceFile,
          });
        }
      } else {
        rows.push({
          key: questionKey(snapshot.questionUid, snapshot.questionId, `${section.id}-${item.id}`),
          sectionId: section.id,
          sectionTitle: section.sectionTitle,
          sectionQuestionType: section.questionType,
          sectionItemId: item.id,
          itemType: 'question',
          questionId: snapshot.questionId,
          questionUid: snapshot.questionUid,
          questionNo: snapshot.questionNo,
          questionType: snapshot.questionType || section.questionType,
          stem: snapshot.stem,
          sharedStem: snapshot.sharedStem,
          material: snapshot.material,
          options: Array.isArray(snapshot.options) ? snapshot.options : [],
          correctAnswer: snapshot.answer,
          analysis: snapshot.analysis,
          sourceFile: snapshot.sourceFile,
        });
      }
    }
  }
  return rows;
}

export const StudentTeacherPaper: React.FC = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pauseTimer } = useTimer();
  const token = useMemo(() => getSessionToken(), []);

  const [assignment, setAssignment] = useState<StudentTeacherExamAssignment | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [showResult, setShowResult] = useState(false);
  const [submission, setSubmission] = useState<{
    score: number;
    correctCount: number;
    totalCount: number;
    resultItems: StudentTeacherExamResultItem[];
  } | null>(null);
  const [pinnedSectionItemId, setPinnedSectionItemId] = useState<number | null>(null);
  const [showAnswersPanel, setShowAnswersPanel] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const questions = useMemo(() => (assignment ? flattenPaper(assignment) : []), [assignment]);

  const resultMap = useMemo(() => {
    const map = new Map<string, StudentTeacherExamResultItem>();
    for (const item of submission?.resultItems || []) {
      map.set(questionKey(item.questionUid, item.questionId, `${item.sectionId}-${item.sectionItemId}-${item.questionNo ?? 0}`), item);
    }
    return map;
  }, [submission]);

  const pinnedItem = useMemo(() => {
    if (!assignment || !pinnedSectionItemId) return null;
    for (const section of assignment.paper.sections || []) {
      const matched = section.items.find((item) => item.id === pinnedSectionItemId);
      if (matched) return matched;
    }
    return null;
  }, [assignment, pinnedSectionItemId]);

  useEffect(() => {
    pauseTimer();
  }, [pauseTimer]);

  useEffect(() => {
    if (showResult) return;
    const timer = window.setInterval(() => setSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(timer);
  }, [showResult]);

  useEffect(() => {
    const load = async () => {
      if (!token || !user?.id || !assignmentId) return;
      setLoading(true);
      setError(null);
      try {
        const payload = await studentTeacherExamApi.getAssignment(token, Number(assignmentId), Number(user.id));
        setAssignment(payload);
        if (payload.latestSubmission) {
          setAnswers((payload.latestSubmission.answers || {}) as AnswerMap);
          setSubmission({
            score: payload.latestSubmission.score,
            correctCount: payload.latestSubmission.correctCount,
            totalCount: payload.latestSubmission.totalCount,
            resultItems: payload.latestSubmission.resultItems || [],
          });
          setShowResult(true);
        } else {
          setAnswers({});
          setSubmission(null);
          setShowResult(false);
          setSeconds(0);
        }
      } catch (e: any) {
        setError(e?.message || '加载单元测试失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [assignmentId, token, user?.id]);

  const updateAnswer = (key: string, value: any) => {
    if (showResult) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const toggleMultiChoice = (key: string, optionKey: string) => {
    if (showResult) return;
    setAnswers((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const next = current.includes(optionKey)
        ? current.filter((item: string) => item !== optionKey)
        : [...current, optionKey];
      return { ...prev, [key]: next };
    });
  };

  const handleSubmit = async () => {
    if (!assignment || !token || !user?.id || questions.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const resultItems = questions.map((question) => ({
        sectionId: question.sectionId,
        sectionItemId: question.sectionItemId,
        itemType: question.itemType,
        questionId: question.questionId ?? undefined,
        questionUid: question.questionUid,
        questionNo: question.questionNo ?? undefined,
        questionType: question.questionType,
        submittedAnswer: answers[question.key] ?? null,
        correctAnswer: question.correctAnswer,
        correct: isCorrectAnswer(answers[question.key], question.correctAnswer, question.questionType),
        sourceFile: question.sourceFile,
        sharedStem: question.sharedStem,
        material: question.material,
        stem: question.stem,
        options: question.options,
        analysis: question.analysis,
      }));
      const correctCount = resultItems.filter((item) => item.correct).length;
      const totalCount = resultItems.length;
      const score = totalCount === 0 ? 0 : Math.round((correctCount * 100) / totalCount);

      const payload = await studentTeacherExamApi.submit(token, assignment.assignmentId, {
        userId: Number(user.id),
        durationSeconds: seconds,
        answers,
        score,
        correctCount,
        totalCount,
        resultItems,
      });

      setSubmission({
        score: payload.score,
        correctCount: payload.correctCount,
        totalCount: payload.totalCount,
        resultItems: payload.resultItems || [],
      });
      setShowResult(true);
    } catch (e: any) {
      setError(e?.message || '提交单元测试失败');
    } finally {
      setSubmitting(false);
    }
  };

  const renderOptions = (question: FlattenedQuestion) => {
    const value = answers[question.key];
    return (
      <div className="mt-3 space-y-2">
        {(question.options || []).map((option, optionIndex) => {
          const checked = question.questionType === 'multiple_choice'
            ? Array.isArray(value) && value.includes(option.key)
            : value === option.key;
          return (
            <label
              key={`${question.key}-${optionIndex}`}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                checked ? 'border-primary bg-primary-container/20' : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type={question.questionType === 'multiple_choice' ? 'checkbox' : 'radio'}
                checked={checked}
                onChange={() => {
                  if (question.questionType === 'multiple_choice') {
                    toggleMultiChoice(question.key, option.key);
                  } else {
                    updateAnswer(question.key, option.key);
                  }
                }}
                disabled={showResult}
                className="mt-1"
              />
              <span className="font-bold">{option.key}.</span>
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>
    );
  };

  const renderQuestionResult = (question: FlattenedQuestion) => {
    if (!showResult) return null;
    const item = resultMap.get(question.key);
    if (!item) return null;
    return (
      <div
        className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
          item.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
        }`}
      >
        <div className="flex items-center gap-2 font-bold">
          {item.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {item.correct ? '回答正确' : '回答错误'}
        </div>
        <div className="mt-2">你的答案：{answerDisplay(item.submittedAnswer)}</div>
        {showAnswersPanel && (
          <>
            <div className="mt-1">正确答案：{answerDisplay(item.correctAnswer)}</div>
            <div className="mt-1">解析：{item.analysis || '-'}</div>
          </>
        )}
      </div>
    );
  };

  const renderSectionItem = (item: TeacherExamPaperSectionItem, itemIndex: number, sectionTitle: string) => {
    const snapshot = item.snapshot || {};
    if (item.itemType === 'group') {
      const questionsInGroup = questions.filter((row) => row.sectionItemId === item.id);
      return (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-500">
              {sectionTitle} 第 {itemIndex + 1} 组
            </div>
            <button
              onClick={() => setPinnedSectionItemId((prev) => (prev === item.id ? null : item.id))}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
            >
              {pinnedSectionItemId === item.id ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {pinnedSectionItemId === item.id ? '取消置顶材料' : '置顶材料'}
            </button>
          </div>

          {pinnedSectionItemId !== item.id && (
            <>
              {snapshot.sharedStem && (
                <div className="mb-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">
                  {snapshot.sharedStem}
                </div>
              )}
              {snapshot.material && (
                <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-7 text-slate-700">
                  {snapshot.material}
                </div>
              )}
            </>
          )}

          <div className="space-y-5">
            {questionsInGroup.map((question, index) => (
              <div key={question.key} className="rounded-xl border border-slate-100 p-4">
                <div className="text-sm font-bold leading-7 text-slate-900">
                  {index + 1}. {question.stem}
                </div>
                {renderOptions(question)}
                {renderQuestionResult(question)}
              </div>
            ))}
          </div>
        </div>
      );
    }

    const question = questions.find((row) => row.sectionItemId === item.id);
    if (!question) return null;

    return (
      <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {snapshot.sharedStem && (
          <div className="mb-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">
            {snapshot.sharedStem}
          </div>
        )}
        {snapshot.material && (
          <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-7 text-slate-700">
            {snapshot.material}
          </div>
        )}
        <div className="text-sm font-bold leading-7 text-slate-900">{question.stem}</div>
        {renderOptions(question)}
        {renderQuestionResult(question)}
      </div>
    );
  };

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">正在加载单元测试...</div>;
  }

  if (!assignment) {
    return <div className="p-8 text-sm text-red-600">{error || '未找到这份单元测试。'}</div>;
  }

  const pinnedSnapshot = pinnedItem?.snapshot || {};

  return (
    <div className="mx-auto w-full max-w-[120rem] p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500"
          >
            <ArrowLeft className="h-4 w-4" />
            返回学生主页
          </button>
          <h1 className="text-3xl font-black text-slate-900">{assignment.paper.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {[assignment.paper.bookVersion, assignment.paper.grade, assignment.paper.semester, assignment.paper.unitCode]
              .filter(Boolean)
              .join(' / ')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">
            用时 {Math.floor(seconds / 60)} 分 {seconds % 60} 秒
          </div>
          {showResult && submission && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              得分 {submission.score} / 正确 {submission.correctCount} / {submission.totalCount}
            </div>
          )}
          <button
            onClick={() => setShowAnswersPanel((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
          >
            {showAnswersPanel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showAnswersPanel ? '隐藏答案和解析' : '显示答案和解析'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={showResult || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-on-primary disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {showResult ? '已提交' : submitting ? '提交中...' : '提交试卷'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className={`grid gap-6 ${pinnedSectionItemId ? 'lg:grid-cols-[340px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        {pinnedSectionItemId && (
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
              <BookOpenText className="h-4 w-4" />
              置顶材料
            </div>
            {pinnedSnapshot.sharedStem && (
              <div className="mb-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">
                {pinnedSnapshot.sharedStem}
              </div>
            )}
            {pinnedSnapshot.material && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-7 text-slate-700">
                {pinnedSnapshot.material}
              </div>
            )}
          </aside>
        )}

        <div className="space-y-6">
          {assignment.paper.sections.map((section) => (
            <section key={section.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-5 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <h2 className="text-lg font-black text-slate-900">
                  {section.sectionTitle} {questionTypeLabel(section.questionType)}
                </h2>
              </div>
              <div className="space-y-5">
                {section.items.map((item, index) => renderSectionItem(item, index, section.sectionTitle))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
