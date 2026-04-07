import React, { useState } from 'react';
import { Volume2, Play } from 'lucide-react';
import { MOCK_PHONETICS } from '../../data/mock';

export const PhoneticsView: React.FC = () => {
  const [activePhonetic, setActivePhonetic] = useState(MOCK_PHONETICS[0]);

  const playAudio = (audioSrc: string) => {
    // In a real app, this would play the audio file
    console.log(`Playing audio: ${audioSrc}`);
    // Mocking audio playback with a small delay
    setTimeout(() => console.log('Audio finished'), 1000);
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <header className="relative overflow-hidden rounded-2xl p-12 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg">
        <div className="relative z-10 max-w-2xl">
          <h1 className="font-headline font-extrabold text-5xl tracking-tight leading-tight mb-4">音标学习</h1>
          <p className="text-emerald-50 text-lg">掌握48个国际音标，让发音更纯正。</p>
        </div>
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/20">
          <h2 className="text-2xl font-bold mb-6">48个国际音标</h2>
          
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-emerald-700 mb-4 border-b border-emerald-100 pb-2">元音 (Vowels)</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
              {MOCK_PHONETICS.filter(p => p.type === 'vowel').map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePhonetic(p);
                    playAudio(p.audio);
                  }}
                  className={`h-16 rounded-xl text-2xl font-bold flex items-center justify-center transition-all ${
                    activePhonetic.id === p.id 
                      ? 'bg-emerald-500 text-white shadow-md scale-105' 
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  {p.symbol}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-emerald-700 mb-4 border-b border-emerald-100 pb-2">辅音 (Consonants)</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
              {MOCK_PHONETICS.filter(p => p.type === 'consonant').map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePhonetic(p);
                    playAudio(p.audio);
                  }}
                  className={`h-16 rounded-xl text-2xl font-bold flex items-center justify-center transition-all ${
                    activePhonetic.id === p.id 
                      ? 'bg-emerald-500 text-white shadow-md scale-105' 
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  {p.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/20 flex flex-col items-center">
          <h2 className="text-xl font-bold mb-8 self-start">音标详情</h2>
          
          <div className="w-32 h-32 bg-emerald-100 rounded-full flex items-center justify-center mb-6 relative group cursor-pointer" onClick={() => playAudio(activePhonetic.audio)}>
            <span className="text-6xl font-black text-emerald-800">{activePhonetic.symbol}</span>
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Volume2 className="w-10 h-10 text-emerald-700" />
            </div>
          </div>

          <div className="w-full mb-8">
            <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">常见字母组合</h4>
            <div className="flex flex-wrap gap-2">
              {activePhonetic.combinations.map((combo, idx) => (
                <span key={idx} className="px-3 py-1 bg-surface-container text-on-surface font-semibold rounded-lg">
                  {combo}
                </span>
              ))}
            </div>
          </div>

          <div className="w-full bg-emerald-50 p-6 rounded-xl border border-emerald-100">
            <h4 className="text-sm font-bold text-emerald-800/60 uppercase tracking-wider mb-3">示例单词</h4>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-black text-emerald-900">{activePhonetic.example}</span>
              <button 
                onClick={() => playAudio(activePhonetic.exampleAudio)}
                className="w-10 h-10 bg-emerald-200 text-emerald-800 rounded-full flex items-center justify-center hover:bg-emerald-300 transition-colors"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
