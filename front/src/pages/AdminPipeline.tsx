import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ZoomIn, ZoomOut, Hand, RotateCw, AudioLines, Filter, ArrowUpDown, Play, Edit2, Trash2, RefreshCw, LogOut } from 'lucide-react';

export const AdminPipeline: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  return (
    <div className="flex w-full h-screen overflow-hidden pt-20">
      {/* Left Side: PDF/Image Viewer */}
      <section className="w-1/2 bg-surface-container-low relative flex flex-col border-r border-outline-variant/30">
        {/* Toolbar Overlay */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur shadow-xl rounded-full px-6 py-2 flex items-center gap-4 border border-white/50">
          <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant">
            <ZoomIn className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant">
            <ZoomOut className="w-5 h-5" />
          </button>
          <div className="h-4 w-[1px] bg-outline-variant/30"></div>
          <span className="text-xs font-bold font-headline px-2">页码 1 / 12</span>
          <div className="h-4 w-[1px] bg-outline-variant/30"></div>
          <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant">
            <Hand className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant">
            <RotateCw className="w-5 h-5" />
          </button>
        </div>

        {/* Viewer Area */}
        <div className="flex-1 flex items-center justify-center p-12 overflow-auto custom-scrollbar">
          <div className="relative bg-white shadow-2xl rounded-sm aspect-[1/1.414] w-full max-w-2xl">
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBG5YtFrOJ-ArSSZ99qSgo6WBskjOPGxzJKqphmXt7m5X5qWw7ISux6ArL1kTdtTBgaycKxvOKzLbMXUmRQqio0eWedyoQLIa5vmVNRfjbHrE-j4W0hPlNQhMWKl3lZ64Ods-7m2naUiuR2xqVzYK_Aa_-2wFWtzJ9Wzbj8Kkm7crtCdsv09uCkv0WjzmlQkhnneorQOjdB_hC5s9pbYedM6fRMUm6cyvancjzunouBlj6xMX9NFd78qlEqNYS6mS_ctgFgVE13k3OI" 
              alt="Document Preview" 
              className="w-full h-full object-cover opacity-90" 
              referrerPolicy="no-referrer"
            />
            {/* Simulated Highlight Overlay */}
            <div className="absolute top-[15%] left-[10%] w-[40%] h-[5%] bg-primary/20 border-2 border-primary rounded-sm cursor-pointer"></div>
          </div>
        </div>

        {/* Footer Status */}
        <div className="p-4 bg-surface-container-highest/50 backdrop-blur-sm border-t border-white/20 flex justify-between items-center">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">源文件: unit_04_reading.pdf</span>
          <div className="flex gap-2 items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-medium">同步中</span>
          </div>
        </div>
      </section>

      {/* Right Side: DataGrid */}
      <section className="w-1/2 bg-surface-bright flex flex-col">
        {/* Header Actions */}
        <div className="p-6 flex justify-between items-center bg-surface-bright/80 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-headline font-extrabold text-xl text-on-surface tracking-tight">内容校对流水线</h2>
            <span className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-[10px] font-black uppercase">12 分段</span>
          </div>
          <div className="flex gap-2">
            <button className="p-2 bg-surface-container-high hover:bg-surface-container-highest rounded-lg transition-colors text-on-surface-variant">
              <Filter className="w-5 h-5" />
            </button>
            <button className="p-2 bg-surface-container-high hover:bg-surface-container-highest rounded-lg transition-colors text-on-surface-variant">
              <ArrowUpDown className="w-5 h-5" />
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-error text-white rounded-lg text-sm font-bold hover:bg-error/90 transition-colors">
              <LogOut className="w-4 h-4" /> 退出
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto custom-scrollbar px-6 pb-6">
          <div className="flex flex-col gap-3">
            {/* Row 1 */}
            <div className="group bg-surface-container-lowest border-2 border-primary-container rounded-xl p-5 shadow-sm transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-black text-primary font-headline">01</span>
                  <div className="w-1 h-full bg-primary-container rounded-full min-h-[40px]"></div>
                </div>
                <div className="flex-1 grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-headline">英文转写</label>
                    <input type="text" defaultValue="The quick brown fox jumps over the lazy dog." className="w-full bg-surface-container-low border-none rounded-lg text-sm font-medium py-3 px-4 focus:ring-2 focus:ring-secondary/20 transition-shadow outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-headline">中文翻译</label>
                    <input type="text" defaultValue="敏捷的棕色狐狸跳过了那只懒狗。" className="w-full bg-surface-container-low border-none rounded-lg text-sm font-medium py-3 px-4 focus:ring-2 focus:ring-secondary/20 transition-shadow outline-none" />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary-container/30 rounded-full">
                        <AudioLines className="w-4 h-4 text-secondary" />
                        <span className="text-[11px] font-bold text-secondary">神经语音: "Aria"</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100/50 rounded-full">
                        <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                        <span className="text-[11px] font-bold text-emerald-700">已就绪</span>
                      </div>
                    </div>
                    <button className="w-8 h-8 flex items-center justify-center bg-primary text-on-primary rounded-full hover:scale-110 transition-transform">
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2 */}
            <div className="group bg-surface-container-lowest hover:bg-surface-container rounded-xl p-5 shadow-sm transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-black text-on-surface-variant font-headline">02</span>
                  <div className="w-1 h-full bg-surface-container-highest rounded-full min-h-[40px]"></div>
                </div>
                <div className="flex-1 grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-headline">英文转写</label>
                    <input type="text" defaultValue="She sells seashells by the seashore." className="w-full bg-transparent border-none rounded-lg text-sm font-medium py-2 px-0 focus:ring-0 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-headline">中文翻译</label>
                    <input type="text" defaultValue="她在海边卖海贝壳。" className="w-full bg-transparent border-none rounded-lg text-sm font-medium py-2 px-0 focus:ring-0 outline-none" />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-highest rounded-full">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">pending</span>
                        <span className="text-[11px] font-bold text-on-surface-variant">等待生成</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-variant rounded-full text-on-surface-variant">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-tertiary-container/20 rounded-full text-tertiary">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3 */}
            <div className="group bg-surface-container-lowest hover:bg-surface-container rounded-xl p-5 shadow-sm transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-black text-on-surface-variant font-headline">03</span>
                  <div className="w-1 h-full bg-surface-container-highest rounded-full min-h-[40px]"></div>
                </div>
                <div className="flex-1 grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-headline">英文转写</label>
                    <input type="text" defaultValue="Pack my box with five dozen liquor jugs." className="w-full bg-transparent border-none rounded-lg text-sm font-medium py-2 px-0 focus:ring-0 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-headline">中文翻译</label>
                    <input type="text" defaultValue="装满我的五个十二酒瓶的箱子。" className="w-full bg-transparent border-none rounded-lg text-sm font-medium py-2 px-0 focus:ring-0 outline-none" />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-error-container/20 rounded-full">
                        <span className="material-symbols-outlined text-[16px] text-error">error</span>
                        <span className="text-[11px] font-bold text-error">转写错误</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-variant rounded-full text-on-surface-variant">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-variant rounded-full text-on-surface-variant">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
