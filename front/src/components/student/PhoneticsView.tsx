import React, { useEffect, useMemo, useState } from 'react';
import { BookAudio, Loader2, Volume2 } from 'lucide-react';
import { PhoneticItem, lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

const EMPTY_EXAMPLES = [
  { word: '', phonetic: '', zh: '', word_audio: '' },
  { word: '', phonetic: '', zh: '', word_audio: '' },
  { word: '', phonetic: '', zh: '', word_audio: '' },
];

export const PhoneticsView: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingPath, setPlayingPath] = useState<string>('');
  const [items, setItems] = useState<PhoneticItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'vowel' | 'consonant'>('all');

  useEffect(() => {
    const loadPhonetics = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await lexiconApi.getPhonetics(token);
        const nextItems = (res.items || []).map((item) => ({
          ...item,
          phoneme_audio: item.phoneme_audio || '',
          example_words: Array.isArray(item.example_words) && item.example_words.length
            ? item.example_words
            : EMPTY_EXAMPLES,
        }));
        setItems(nextItems);
        setActiveId(nextItems[0]?.id || '');
      } catch (e: any) {
        setError(e?.message || '加载音标数据失败');
        setItems([]);
        setActiveId('');
      } finally {
        setLoading(false);
      }
    };

    loadPhonetics();
  }, [token]);

  const vowels = useMemo(() => items.filter((item) => item.category === 'vowel'), [items]);
  const consonants = useMemo(() => items.filter((item) => item.category === 'consonant'), [items]);
  const visibleItems = useMemo(() => {
    if (filter === 'vowel') return vowels;
    if (filter === 'consonant') return consonants;
    return items;
  }, [filter, vowels, consonants, items]);

  const activeItem = useMemo(() => {
    const fromVisible = visibleItems.find((item) => item.id === activeId);
    if (fromVisible) return fromVisible;
    return items.find((item) => item.id === activeId) || visibleItems[0] || items[0] || null;
  }, [visibleItems, items, activeId]);

  useEffect(() => {
    if (!activeItem && visibleItems.length > 0) {
      setActiveId(visibleItems[0].id);
      return;
    }
    if (activeItem && activeId !== activeItem.id) {
      setActiveId(activeItem.id);
    }
  }, [visibleItems, activeItem, activeId]);

  const playAudio = async (path?: string) => {
    if (!path) return;
    setPlayingPath(path);
    setError(null);
    try {
      await lexiconApi.playAudioWithAuth(token, path);
    } catch {
      setError('音频播放失败，请稍后重试');
    } finally {
      setPlayingPath('');
    }
  };

  const renderPhonemeGroup = (title: string, group: PhoneticItem[], tone: 'amber' | 'emerald') => {
    const tones = tone === 'amber'
      ? {
          title: 'text-amber-800',
          border: 'border-amber-200',
          active: 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 scale-[1.02]',
          idle: 'bg-amber-50 text-amber-900 hover:bg-amber-100',
          badge: 'bg-amber-100 text-amber-800',
        }
      : {
          title: 'text-emerald-800',
          border: 'border-emerald-200',
          active: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-[1.02]',
          idle: 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
          badge: 'bg-emerald-100 text-emerald-800',
        };

    return (
      <section className="space-y-4">
        <div className={`flex items-center justify-between border-b ${tones.border} pb-2`}>
          <h3 className={`text-lg font-black ${tones.title}`}>{title}</h3>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${tones.badge}`}>{group.length} 个</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {group.map((item) => {
            const isActive = activeItem?.id === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                className={`rounded-2xl px-3 py-4 text-center transition-all ${isActive ? tones.active : tones.idle}`}
              >
                <div className="text-2xl font-black tracking-wide">{item.phonetic}</div>
                <div className={`mt-2 text-xs font-semibold ${isActive ? 'text-white/80' : 'text-on-surface-variant'}`}>
                  {item.category === 'vowel' ? '元音' : '辅音'}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <header className="relative overflow-hidden rounded-[2rem] px-8 py-10 md:px-12 md:py-12 bg-[linear-gradient(135deg,#0f766e_0%,#14b8a6_48%,#facc15_100%)] text-white shadow-xl">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold tracking-wide">
            <BookAudio className="w-4 h-4" />
            48个国际音标
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tight">音标学习</h1>
          <p className="mt-3 max-w-2xl text-white/90 text-base md:text-lg leading-7">
            点击音标听发音，再配合例词一起记忆。先听，再读，再模仿，学习起来会更轻松。
          </p>
        </div>
        <div className="absolute -right-16 -top-12 h-52 w-52 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -left-10 -bottom-16 h-48 w-48 rounded-full bg-yellow-200/20 blur-3xl" />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-full font-bold transition-colors ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
        >
          全部音标
        </button>
        <button
          onClick={() => setFilter('vowel')}
          className={`px-4 py-2 rounded-full font-bold transition-colors ${filter === 'vowel' ? 'bg-amber-500 text-white' : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-50'}`}
        >
          只看元音
        </button>
        <button
          onClick={() => setFilter('consonant')}
          className={`px-4 py-2 rounded-full font-bold transition-colors ${filter === 'consonant' ? 'bg-emerald-600 text-white' : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}
        >
          只看辅音
        </button>
        <div className="ml-auto flex gap-3 text-sm">
          <span className="rounded-full bg-white border border-slate-200 px-4 py-2">总数：<b>{items.length}</b></span>
          <span className="rounded-full bg-amber-50 border border-amber-200 px-4 py-2 text-amber-900">元音：<b>{vowels.length}</b></span>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-4 py-2 text-emerald-900">辅音：<b>{consonants.length}</b></span>
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {loading && (
        <div className="rounded-3xl border border-outline-variant/20 bg-surface-container-lowest px-6 py-16 flex items-center justify-center gap-3 text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" />
          正在加载音标数据...
        </div>
      )}

      {!loading && !items.length && (
        <div className="rounded-3xl border border-outline-variant/20 bg-surface-container-lowest px-6 py-16 text-center text-on-surface-variant">
          当前还没有可用的音标数据。
        </div>
      )}

      {!loading && items.length > 0 && activeItem && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_420px] gap-8 items-start">
          <div className="space-y-8 rounded-[2rem] bg-surface-container-lowest border border-outline-variant/20 p-6 md:p-8 shadow-sm">
            {(filter === 'all' || filter === 'vowel') && renderPhonemeGroup('20个元音', vowels, 'amber')}
            {(filter === 'all' || filter === 'consonant') && renderPhonemeGroup('28个辅音', consonants, 'emerald')}
          </div>

          <aside className="rounded-[2rem] bg-white border border-outline-variant/20 shadow-sm p-6 md:p-8 sticky top-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold tracking-wide text-on-surface-variant">当前音标</div>
                <div className="mt-3 text-6xl font-black text-slate-900 tracking-wide">{activeItem.phonetic}</div>
                <div className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                  {activeItem.category === 'vowel' ? '元音' : '辅音'}
                </div>
              </div>
              <button
                onClick={() => playAudio(activeItem.phoneme_audio)}
                disabled={!activeItem.phoneme_audio || playingPath === activeItem.phoneme_audio}
                className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-white font-bold hover:bg-slate-800 disabled:opacity-50"
              >
                {playingPath === activeItem.phoneme_audio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                试听音标
              </button>
            </div>

            <div className="mt-8 space-y-4">
              <div className="text-sm font-bold tracking-wide text-on-surface-variant">例词学习</div>
              {(activeItem.example_words || EMPTY_EXAMPLES).map((example, index) => (
                <div key={`${activeItem.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-2xl font-black text-slate-900">{example.word || `例词 ${index + 1}`}</div>
                      <div className="mt-1 text-base font-semibold text-teal-700">{example.phonetic || '-'}</div>
                      <div className="mt-2 text-sm text-slate-600">{example.zh || '暂无中文释义'}</div>
                    </div>
                    <button
                      onClick={() => playAudio(example.word_audio)}
                      disabled={!example.word_audio || playingPath === example.word_audio}
                      className="inline-flex items-center justify-center rounded-full bg-white border border-slate-200 p-3 hover:bg-slate-100 disabled:opacity-50"
                      title="试听单词"
                    >
                      {playingPath === example.word_audio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4 text-slate-700" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
