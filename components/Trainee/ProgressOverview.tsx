
import React, { useMemo, useState } from 'react';
import { TestResult, Training } from '../../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface ProgressOverviewProps {
  results: TestResult[];
  trainings: Training[];
  userName: string;
}

export const ProgressOverview: React.FC<ProgressOverviewProps> = ({ results, trainings, userName }) => {
  const [selectedDetail, setSelectedDetail] = useState<TestResult | null>(null);

  const stats = useMemo(() => {
    if (results.length === 0) return null;
    const historyData = [...results].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const chartData = [...results].map(r => ({
      title: trainings.find(tr => tr.id === r.trainingId)?.title || '不明',
      pre: r.preScore,
      post: r.postScore,
      date: r.completedAt
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const totalImprovement = results.reduce((acc, r) => acc + (r.postScore !== -1 ? (r.postScore - r.preScore) : 0), 0);
    return { chartData, historyData, totalImprovement };
  }, [results, trainings]);

  if (!stats) return <div className="p-20 text-center text-slate-300 font-bold italic bg-white rounded-3xl border border-dashed">受講データがまだありません。</div>;

  const renderDetailModal = (res: TestResult) => {
    const t = trainings.find(tr => tr.id === res.trainingId);
    const questions = t?.patterns.find(p => p.id === t.activePatternId)?.questions || [];

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 md:p-6 animate-fadeIn">
        <div className="bg-white rounded-[2rem] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="p-6 md:p-8 border-b bg-indigo-50 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-black text-slate-800">テスト回答詳細</h3>
              <p className="text-xs font-bold text-indigo-600">{res.trainingTitle}</p>
            </div>
            <button onClick={() => setSelectedDetail(null)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-slate-400 hover:text-rose-500 transition-colors font-bold">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            {questions.length > 0 ? questions.map((q, idx) => {
              const userAns = res.userAnswers?.[idx];
              const isCorrect = userAns === q.correctAnswer;
              return (
                <div key={idx} className={`p-5 rounded-2xl border-2 ${isCorrect ? 'border-emerald-100 bg-emerald-50/20' : 'border-rose-100 bg-rose-50/20'}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>Q{idx + 1}</span>
                    <p className="font-bold text-slate-800 text-sm">{q.question}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    <div className="px-3 py-2 bg-white border rounded-xl text-[10px] text-slate-500">
                      <span className="font-black text-emerald-600 mr-2">正解:</span> {q.options[q.correctAnswer]}
                    </div>
                    <div className={`px-3 py-2 border rounded-xl text-[10px] font-bold ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      <span className="mr-2">あなたの回答:</span>
                      {userAns !== undefined && userAns !== -1 && q.options[userAns] ? q.options[userAns] : <span className="text-slate-400 italic">未回答または記録なし</span>}
                    </div>
                  </div>
                  <div className="p-3 bg-white/60 rounded-xl">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">解説</p>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{q.explanation}</p>
                  </div>
                </div>
              );
            }) : <p className="text-center text-slate-400 italic py-10">問題データが見つかりません</p>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-20">
      {selectedDetail && renderDetailModal(selectedDetail)}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-3xl border shadow-sm"><span className="block text-xs font-bold text-slate-400 uppercase mb-1">受講回数</span><span className="text-4xl font-black">{results.length} 回</span></div>
        <div className="bg-white p-8 rounded-3xl border shadow-sm"><span className="block text-xs font-bold text-slate-400 uppercase mb-1">成長スコア合計</span><span className="text-4xl font-black text-indigo-600">+{stats.totalImprovement} pt</span></div>
        <div className="bg-indigo-600 p-8 rounded-3xl shadow-xl text-white"><span className="block text-xs font-bold text-indigo-200 uppercase mb-1">現在のスキル状態</span><p className="text-lg font-bold">着実にスキルアップ中</p></div>
      </div>

      <div className="bg-white p-10 rounded-[2.5rem] border shadow-sm">
        <h3 className="text-xl font-black mb-8">理解度の推移</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="title" hide />
              <YAxis domain={[0, 20]} />
              <Tooltip />
              <Line name="事後スコア" type="monotone" dataKey="post" stroke="#6366f1" strokeWidth={4} dot={{ r: 6 }} />
              <Line name="事前スコア" type="monotone" dataKey="pre" stroke="#e2e8f0" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-slate-50 font-black">学習アーカイブ（クリックで詳細表示）</div>
        <div className="divide-y divide-slate-100">
          {stats.historyData.map((r, i) => (
            <div key={i} onClick={() => setSelectedDetail(r)} className="p-8 flex justify-between items-center hover:bg-indigo-50/30 transition-all group cursor-pointer">
              <div className="flex-1">
                <p className="text-lg font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{r.trainingTitle}</p>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-xs text-slate-400 font-bold uppercase">{new Date(r.completedAt).toLocaleDateString()}</p>
                  {r.analysis && <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-black">AI分析済み</span>}
                </div>
                {r.analysis && (
                  <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <p className="text-xs font-bold text-indigo-900 leading-relaxed italic">AI成長フィードバック: "{r.advice || r.analysis.substring(0, 100)}..."</p>
                  </div>
                )}
              </div>
              <div className="text-right ml-8">
                <p className="text-xs font-black text-slate-300 uppercase">Score</p>
                <p className={`text-2xl font-black ${r.postScore > r.preScore ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {r.preScore} → {r.postScore === -1 ? '未完' : r.postScore}
                </p>
                <p className="text-[10px] font-black text-indigo-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter">Click to review answers</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
