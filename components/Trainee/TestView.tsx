
import React, { useState, useEffect, useRef } from 'react';
import { Training, TestResult, Question } from '../../types';
import { analyzeIndividualPerformance } from '../../services/geminiService';

interface TestViewProps {
  training: Training;
  userName: string;
  employeeId: string;
  allResults: TestResult[];
  initialPhase?: 'intro' | 'pre' | 'post' | 'review';
  onComplete: (result: TestResult) => void;
  onClose: () => void;
}

export const TestView: React.FC<TestViewProps> = ({ training, userName, employeeId, allResults, initialPhase = 'intro', onComplete, onClose }) => {
  const activePattern = training.patterns.find(p => p.id === training.activePatternId) || training.patterns[0];
  const questions = activePattern?.questions || [];
  const totalQuestions = questions.length;

  const [phase, setPhase] = useState<'intro' | 'pre' | 'pre_complete' | 'post' | 'post_complete' | 'fin' | 'review'>(initialPhase as any);
  const [answers, setAnswers] = useState<number[]>(new Array(totalQuestions).fill(-1));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preScore, setPreScore] = useState(0);
  const [postScore, setPostScore] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [finalResult, setFinalResult] = useState<TestResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [postAnswerTimeSec, setPostAnswerTimeSec] = useState<number | undefined>(undefined);
  const phaseStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const res = allResults.find(r => r.trainingId === training.id && r.employeeId === employeeId);
    if (res) {
      setPreScore(res.preScore);
      if (res.postScore !== -1) {
        setPostScore(res.postScore);
        setFinalResult(res);
      }
    }
  }, [allResults, training.id, employeeId]);

  // テスト開始時刻を記録（事後テストの回答時間計測用）
  useEffect(() => {
    if (phase === 'pre' || phase === 'post') {
      phaseStartTimeRef.current = Date.now();
    }
  }, [phase]);

  const calculateScore = () => {
    let score = 0;
    answers.forEach((ans, idx) => { if (ans === questions[idx].correctAnswer) score++; });
    return score;
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) { setCurrentIndex(currentIndex + 1); }
    else {
      const score = calculateScore();
      if (phase === 'pre') {
        setPreScore(score);
        onComplete({
          trainingId: training.id,
          trainingTitle: training.title,
          employeeName: userName,
          employeeId,
          preScore: score,
          postScore: -1,
          userAnswers: [...answers],
          completedAt: new Date().toISOString(),
          analysis: ""
        });
        setPhase('pre_complete');
      } else {
        setPostScore(score);
        // 事後テストの回答所要時間を記録（チート検知用）
        if (phaseStartTimeRef.current) {
          const elapsed = Math.round((Date.now() - phaseStartTimeRef.current) / 1000);
          setPostAnswerTimeSec(elapsed);
        }
        setPhase('post_complete');
      }
      // Note: We don't clear answers yet as we need them for finishTest
      setCurrentIndex(0);
    }
  };

  const finishTest = async () => {
    setIsAnalyzing(false); // No longer analyzing locally
    setPhase('fin');

    console.log('📝 ========== FINISHING TEST ==========');
    console.log('Training:', training.title);
    console.log('answers array:', answers);
    console.log('answers length:', answers.length);
    console.log('preScore:', preScore);
    console.log('postScore:', postScore);

    const result: TestResult = {
      trainingId: training.id,
      trainingTitle: training.title,
      employeeName: userName,
      employeeId,
      preScore: preScore,
      postScore: postScore,
      userAnswers: [...answers],
      completedAt: new Date().toISOString(),
      analysis: "", // To be filled by HR/Midnight process
      advice: "",
      traits: [],
      competencies: [],
      totalQuestions,
      postAnswerTimeSec
    };

    console.log('result object:', result);
    console.log('result.userAnswers:', result.userAnswers);
    console.log('======================================');

    setFinalResult(result);
    onComplete(result);
  };

  if (phase === 'intro') {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-12 border text-center shadow-2xl animate-fadeIn">
        <h2 className="text-xl md:text-3xl font-black mb-4">{training.title}</h2>
        <p className="text-sm md:text-lg text-slate-500 mb-8 md:mb-10 leading-relaxed italic">受講前後で理解度の変化を測定します。<br />まずは事前テスト（全{totalQuestions}問）に挑戦しましょう。</p>
        <button onClick={() => setPhase('pre')} className="w-full py-4 md:py-6 bg-indigo-600 text-white rounded-xl md:rounded-[2rem] font-black text-lg md:text-xl shadow-xl">テストを開始</button>
      </div>
    );
  }

  if (phase === 'pre_complete') {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-12 border text-center shadow-2xl">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8 text-3xl md:text-4xl">✓</div>
        <h2 className="text-2xl md:text-3xl font-black mb-4">事前テスト完了</h2>
        <p className="text-base md:text-lg text-slate-500 mb-8 md:mb-10">得点: <span className="text-indigo-600 font-black">{preScore} / {totalQuestions}</span></p>
        <button onClick={onClose} className="w-full py-4 md:py-6 bg-slate-900 text-white rounded-xl md:rounded-[2rem] font-black text-lg md:text-xl">ポータルへ戻る</button>
      </div>
    );
  }

  if (phase === 'post_complete') {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-12 border text-center shadow-2xl animate-fadeIn">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-2xl md:text-3xl font-black mb-4 text-slate-800">講義テスト完了！</h2>
        <div className="mb-8 md:mb-10 space-y-4">
          <div className="inline-block px-8 py-4 bg-slate-50 rounded-2xl border-2 border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">今回の得点</p>
            <p className="text-4xl font-black text-indigo-600">{postScore} / {totalQuestions}</p>
          </div>
          <p className="text-base md:text-lg text-slate-500 font-bold leading-relaxed max-w-sm mx-auto">
            素晴らしい取り組みでした！<br />
            一歩一歩の積み重ねが、確実にあなたの力となっています。
          </p>
        </div>
        <button onClick={finishTest} className="w-full py-4 md:py-6 bg-indigo-600 text-white rounded-xl md:rounded-[2rem] font-black text-lg md:text-xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
          AIによる成長分析を確認する
        </button>
      </div>
    );
  }

  if (phase === 'fin' || phase === 'review') {
    return (
      <div className="max-w-3xl mx-auto bg-white rounded-[1.5rem] md:rounded-[3rem] p-6 md:p-12 border shadow-2xl animate-slideUp">
        <div className="space-y-6 md:space-y-8">
          <div className="text-center">
            <h2 className="text-xl md:text-2xl font-black text-slate-800">受講完了！</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] md:text-xs mt-2">{training.title}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            <div className="p-4 md:p-6 bg-slate-50 rounded-xl md:rounded-2xl text-center border">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 mb-1">事前スコア</p>
              <p className="text-2xl md:text-4xl font-black text-slate-300">{preScore}</p>
            </div>
            <div className="p-4 md:p-6 bg-indigo-600 rounded-xl md:rounded-2xl text-center shadow-lg">
              <p className="text-[9px] md:text-[10px] font-black text-indigo-200 mb-1">事後スコア</p>
              <p className="text-2xl md:text-4xl font-black text-white">{postScore}</p>
            </div>
          </div>

          <div className="p-6 md:p-10 bg-indigo-50 rounded-[1.5rem] md:rounded-[2.5rem] border border-indigo-100 text-center">
            <h3 className="text-base md:text-lg font-black text-indigo-900 mb-2">フィードバック待ち</h3>
            <p className="text-xs md:text-sm text-indigo-800 font-bold leading-relaxed italic">
              {finalResult?.analysis || "AIによる精確な成長分析を行っています。\nしばらくしてからポータルで結果を確認してください。"}
            </p>
          </div>

          <button onClick={() => setShowDetails(!showDetails)} className="w-full py-3 md:py-4 border-2 border-slate-100 text-slate-500 rounded-xl md:rounded-2xl font-black text-xs md:text-sm">
            {showDetails ? "詳細を閉じる" : "回答詳細を確認する"}
          </button>

          {showDetails && (
            <div className="space-y-4 md:space-y-6 animate-fadeIn">
              <h4 className="font-black text-slate-800 border-b pb-2 text-sm">問題ごとの詳細</h4>
              {questions.map((q, idx) => {
                const userAns = finalResult?.userAnswers?.[idx];
                const isCorrect = userAns === q.correctAnswer;
                return (
                  <div key={idx} className={`p-4 md:p-6 rounded-xl md:rounded-2xl border-2 ${isCorrect ? 'border-emerald-100 bg-emerald-50/30' : 'border-rose-100 bg-rose-50/30'}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <span className={`w-6 h-6 md:w-8 md:h-8 rounded-lg flex items-center justify-center font-black text-[10px] md:text-xs shrink-0 ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>Q{idx + 1}</span>
                      <p className="font-bold text-slate-800 text-sm">{q.question}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 mb-3">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold border ${oIdx === q.correctAnswer ? 'bg-emerald-100 border-emerald-300 text-emerald-800' :
                          oIdx === userAns ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-white border-slate-100 text-slate-400'
                          }`}>
                          {String.fromCharCode(65 + oIdx)}. {opt}
                          {oIdx === q.correctAnswer && " ✓"}
                        </div>
                      ))}
                      {(userAns === undefined || userAns === -1) && (
                        <div className="px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold border bg-rose-50 border-rose-200 text-rose-800 italic">
                          あなたの回答: 未回答または記録なし
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-white/60 rounded-xl">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">解説</p>
                      <p className="text-[10px] md:text-xs text-slate-600 font-medium leading-relaxed">{q.explanation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={onClose} className="w-full py-4 md:py-6 bg-slate-900 text-white rounded-xl md:rounded-[2rem] font-black text-lg md:text-xl shadow-xl">ホームへ戻る</button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const allAnswered = answers.every(a => a !== -1);

  return (
    <div className="max-w-3xl mx-auto space-y-4 md:space-y-8 animate-fadeIn">
      <div className="flex justify-between items-end px-2">
        <div>
          <span className="px-2 md:px-3 py-0.5 md:py-1 bg-indigo-600 text-white rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest">{phase === 'post' ? 'POST-TEST' : 'PRE-TEST'}</span>
          <h2 className="text-xl md:text-2xl font-black mt-1 text-slate-800 tracking-tight line-clamp-1">{training.title}</h2>
        </div>
        <div className="text-right">
          <span className="text-xl md:text-2xl font-black text-indigo-600">{currentIndex + 1} / {totalQuestions}</span>
          <p className="text-[10px] font-bold text-slate-400">回答済み: {answers.filter(a => a !== -1).length}/{totalQuestions}</p>
        </div>
      </div>
      <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-6 md:p-10 border shadow-2xl min-h-[400px] md:min-h-[450px] flex flex-col justify-between">
        {currentQ ? (
          <>
            <div>
              <h3 className="text-lg md:text-xl font-bold leading-relaxed mb-6 md:mb-10 text-slate-800">{currentQ.question}</h3>
              <div className="grid grid-cols-1 gap-3 md:gap-4">
                {currentQ.options.map((opt, idx) => (
                  <button key={idx} onClick={() => { const n = [...answers]; n[currentIndex] = idx; setAnswers(n); }} className={`w-full p-4 md:p-5 text-left rounded-xl md:rounded-2xl border-2 transition-all font-bold flex items-center gap-3 md:gap-4 ${answers[currentIndex] === idx ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-50 bg-slate-50 text-slate-500'}`}>
                    <span className={`w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center border-2 text-xs md:text-sm shrink-0 transition-all ${answers[currentIndex] === idx ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-400'}`}>{String.fromCharCode(65 + idx)}</span>
                    <span className="text-sm md:text-base">{opt}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 md:mt-10 space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className={`flex-1 py-3 md:py-4 rounded-xl font-bold text-sm md:text-base transition-all ${currentIndex === 0 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                >
                  ← 前の問題
                </button>
                <button
                  onClick={() => setCurrentIndex(Math.min(totalQuestions - 1, currentIndex + 1))}
                  disabled={currentIndex === totalQuestions - 1}
                  className={`flex-1 py-3 md:py-4 rounded-xl font-bold text-sm md:text-base transition-all ${currentIndex === totalQuestions - 1 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                >
                  次の問題 →
                </button>
              </div>
              <button
                onClick={handleNext}
                disabled={!allAnswered}
                className={`w-full py-4 md:py-6 rounded-xl md:rounded-2xl font-black text-lg md:text-xl transition-all ${!allAnswered ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-700'}`}
              >
                {allAnswered ? '📋 最終提出する' : `まだ ${totalQuestions - answers.filter(a => a !== -1).length} 問未回答です`}
              </button>
            </div>
          </>
        ) : <div className="text-center py-20 text-slate-300 font-bold italic">問題を読み込み中...</div>}
      </div>
    </div>
  );
};
