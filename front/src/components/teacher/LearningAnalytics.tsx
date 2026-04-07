import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, Clock, CheckCircle2, PlayCircle, Minus } from 'lucide-react';
import { MOCK_STUDENT_STATS } from '../../data/mock';

export const LearningAnalytics: React.FC = () => {
  const [expandedStudents, setExpandedStudents] = useState<string[]>([]);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [expandedExplanations, setExpandedExplanations] = useState<string[]>([]);

  const toggleStudent = (id: string) => {
    setExpandedStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleExplanation = (questionId: string) => {
    setExpandedExplanations(prev => prev.includes(questionId) ? prev.filter(id => id !== questionId) : [...prev, questionId]);
  };

  const renderStatus = (module: any) => {
    if (!module) return <span className="text-gray-400">---</span>;
    if (module.status === 'completed') {
      return <span className="text-emerald-600 font-medium flex items-center justify-center gap-1"><CheckCircle2 size={14} /> {module.duration}</span>;
    }
    if (module.status === 'in-progress') {
      return <span className="text-blue-600 font-medium flex items-center justify-center gap-1"><PlayCircle size={14} /> {module.startTime} 开始</span>;
    }
    return <span className="text-gray-400 flex items-center justify-center"><Minus size={14} /></span>;
  };

  return (
    <div className="p-8">
      <h2 className="text-3xl font-extrabold mb-8">学情监控</h2>
      <div className="bg-surface-container rounded-xl shadow-sm">
        <div className="grid grid-cols-12 px-8 py-4 bg-surface-container-high text-on-surface-variant font-bold text-xs uppercase tracking-widest rounded-t-xl">
          <div className="col-span-6">学生姓名</div>
          <div className="col-span-6 text-right">已学习单元数量</div>
        </div>
        <div className="divide-y divide-surface-container-high">
          {MOCK_STUDENT_STATS.map((student) => (
            <div key={student.id}>
              <div className="grid grid-cols-12 items-center px-6 py-5 bg-surface-container-lowest cursor-pointer hover:bg-surface-container-low transition-colors" onClick={() => toggleStudent(student.id)}>
                <div className="col-span-6 flex items-center gap-4">
                  {expandedStudents.includes(student.id) ? <ChevronDown size={20} className="text-primary" /> : <ChevronRight size={20} className="text-on-surface-variant" />}
                  <img src={student.avatar} alt="Student" className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer" />
                  <div>
                    <p className="font-bold text-lg">{student.name}</p>
                    <p className="text-xs text-on-surface-variant font-medium">{student.grade} · {student.textbook}</p>
                  </div>
                </div>
                <div className="col-span-6 text-right font-black text-xl text-primary">{student.unitProgress?.length || 0}</div>
              </div>
              
              {expandedStudents.includes(student.id) && (
                <div className="px-6 py-6 bg-surface-container-lowest border-t border-surface-container-high space-y-8">
                  
                  {/* 单元学习概况 */}
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <div className="w-1 h-5 bg-primary rounded-full"></div>
                      单元学习概况
                    </h3>
                    {student.unitProgress && student.unitProgress.length > 0 ? (
                      <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-surface-container-low text-on-surface-variant font-bold text-xs uppercase">
                              <th className="p-3 text-left">年级+单元</th>
                              <th className="p-3 text-center">学习组</th>
                              <th className="p-3 text-center">单词闯关</th>
                              <th className="p-3 text-center">短语闯关</th>
                              <th className="p-3 text-center">课文阅读</th>
                              <th className="p-3 text-center">单元测试</th>
                              <th className="p-3 text-center">完成时间</th>
                              <th className="p-3 text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {student.unitProgress.map((unit, unitIdx) => (
                              <React.Fragment key={unitIdx}>
                                {unit.groups.map((group, groupIdx) => (
                                  <tr key={`${unitIdx}-${groupIdx}`} className="hover:bg-surface-container-lowest/50">
                                    {groupIdx === 0 && (
                                      <td className="p-3 font-bold align-middle bg-surface-container-lowest" rowSpan={unit.groups.length}>
                                        {unit.grade} <br/> <span className="text-primary">{unit.unit}</span>
                                      </td>
                                    )}
                                    <td className="p-3 text-center font-medium text-on-surface-variant bg-surface-container-lowest/30">{group.groupName}</td>
                                    <td className="p-3 text-center">{renderStatus(group.words)}</td>
                                    <td className="p-3 text-center">{renderStatus(group.phrases)}</td>
                                    <td className="p-3 text-center">{renderStatus(group.reading)}</td>
                                    {groupIdx === 0 && (
                                      <>
                                        <td className="p-3 text-center align-middle bg-surface-container-lowest" rowSpan={unit.groups.length}>
                                          {unit.unitTest?.status === 'completed' ? (
                                            <span className="font-black text-lg text-primary">{unit.unitTest.score}分</span>
                                          ) : (
                                            <span className="text-gray-400">---</span>
                                          )}
                                        </td>
                                        <td className="p-3 text-center align-middle text-on-surface-variant bg-surface-container-lowest" rowSpan={unit.groups.length}>
                                          {unit.unitTest?.completionTime || '---'}
                                        </td>
                                        <td className="p-3 text-center align-middle bg-surface-container-lowest" rowSpan={unit.groups.length}>
                                          {unit.unitTest?.status === 'completed' && (
                                            <button 
                                              onClick={() => setSelectedTest(unit.unitTest)} 
                                              className="p-2 bg-primary-container text-on-primary-fixed rounded-lg hover:bg-primary hover:text-on-primary transition-colors mx-auto flex items-center justify-center"
                                              title="查看测试详情"
                                            >
                                              <Eye size={18} />
                                            </button>
                                          )}
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-on-surface-variant bg-surface-container-low/30 rounded-xl">
                        暂无单元学习数据
                      </div>
                    )}
                  </div>

                  {/* 单词测试结果 */}
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <div className="w-1 h-5 bg-tertiary rounded-full"></div>
                      单词测试结果
                    </h3>
                    {student.wordTests && student.wordTests.length > 0 ? (
                      <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-surface-container-low text-on-surface-variant font-bold text-xs uppercase">
                              <th className="p-3 text-left">测试名称</th>
                              <th className="p-3 text-center">类型</th>
                              <th className="p-3 text-center">用时</th>
                              <th className="p-3 text-center">得分</th>
                              <th className="p-3 text-center">完成时间</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {student.wordTests.map((test, idx) => (
                              <tr key={idx} className="hover:bg-surface-container-lowest/50 text-center">
                                <td className="p-3 font-bold text-left">{test.title}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${test.type === '听写' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                    {test.type === '听写' ? '听写' : '默写'}
                                  </span>
                                </td>
                                <td className="p-3 text-on-surface-variant flex items-center justify-center gap-1">
                                  <Clock size={14} /> {test.duration}
                                </td>
                                <td className="p-3 font-black text-lg text-primary">{test.score}分</td>
                                <td className="p-3 text-on-surface-variant">{test.completionTime}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-on-surface-variant bg-surface-container-low/30 rounded-xl">
                        暂无单词测试数据
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 测试详情弹窗 */}
      {selectedTest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-8 animate-in fade-in" onClick={() => setSelectedTest(null)}>
          <div className="bg-surface-container-lowest rounded-2xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black">单元测试详情</h3>
              <div className="text-xl font-black text-primary bg-primary-container px-4 py-2 rounded-xl">
                得分: {selectedTest.score}
              </div>
            </div>
            
            <div className="space-y-6">
              {selectedTest.details.map((q: any, i: number) => (
                <div key={i} className="border-b border-outline-variant/20 pb-6 last:border-0">
                  <p className="font-bold text-lg mb-4">{i + 1}. {q.question}</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {q.options.map((opt: string, j: number) => {
                      let bgClass = 'bg-surface-container-low hover:bg-surface-container-high';
                      let textClass = 'text-on-surface';
                      let borderClass = 'border border-transparent';
                      
                      if (j === q.correct) {
                        bgClass = 'bg-emerald-100';
                        textClass = 'text-emerald-800 font-bold';
                        borderClass = 'border-emerald-300';
                      } else if (j === q.studentAnswer && j !== q.correct) {
                        bgClass = 'bg-error-container';
                        textClass = 'text-on-error-container font-bold';
                        borderClass = 'border-error/30';
                      }
                      
                      return (
                        <div key={j} className={`p-3 rounded-xl transition-colors ${bgClass} ${textClass} ${borderClass}`}>
                          {opt}
                        </div>
                      );
                    })}
                  </div>
                  
                  <button 
                    onClick={() => toggleExplanation(q.id)} 
                    className="text-sm text-primary font-bold flex items-center gap-1 hover:text-primary-dim transition-colors"
                  >
                    {expandedExplanations.includes(q.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {expandedExplanations.includes(q.id) ? '隐藏解析' : '查看解析'}
                  </button>
                  
                  {expandedExplanations.includes(q.id) && (
                    <div className="mt-3 p-4 bg-surface-container-low rounded-xl text-sm text-on-surface-variant border-l-4 border-primary animate-in slide-in-from-top-2">
                      <span className="font-bold text-on-surface">解析：</span>{q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setSelectedTest(null)}
                className="px-6 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold rounded-xl transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
