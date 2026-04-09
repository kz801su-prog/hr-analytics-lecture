
import React, { useState, useRef } from 'react';
import { generateQuestionsFromMaterials } from '../../services/geminiService';
import { Training, Question, TrainingMaterial, TestResult, TestPattern, WrongAnswerAnalysis, Employee } from '../../types';
import { TargetAudienceSelector } from './TargetAudienceSelector';

interface TrainingCreatorProps {
  onUpdateTraining: (training: Training) => void;
  trainings: Training[];
  results: TestResult[];
  wrongAnswerAnalyses: WrongAnswerAnalysis[];
  onSaveWrongAnswerAnalysis: (analysis: WrongAnswerAnalysis) => void;
  onOpenSelectKey: () => Promise<void>;
  employees: Employee[];
}

export const TrainingCreator: React.FC<TrainingCreatorProps> = ({ onUpdateTraining, trainings, results, wrongAnswerAnalyses, onSaveWrongAnswerAnalysis, onOpenSelectKey, employees }) => {
  const [editingTraining, setEditingTraining] = useState<Training | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [content, setContent] = useState('');
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<'Standard' | 'Difficult' | 'MAX'>('Standard');
  const [modelName, setModelName] = useState<string>('gemini-2.5-flash');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);

  const [editingQuestions, setEditingQuestions] = useState<Question[]>([]);
  const [currentPatternId, setCurrentPatternId] = useState<string>('');
  const [showWrongAnswerModal, setShowWrongAnswerModal] = useState(false);
  const [targetEmployees, setTargetEmployees] = useState<string[]>([]);
  const [targetDepartments, setTargetDepartments] = useState<string[]>([]);
  const [targetPositions, setTargetPositions] = useState<string[]>([]);
  const [wrongAnswerData, setWrongAnswerData] = useState<WrongAnswerAnalysis[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isRequiredForAll, setIsRequiredForAll] = useState(false);
  const [studyLinks, setStudyLinks] = useState<{ label: string; url: string }[]>([]);
  // GAS同期でリセットされないようローカルに永続化
  const [trainingFlags, setTrainingFlags] = useState<Record<string, { isRequiredForAll: boolean; fiscalYear?: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('sb_training_flags') || '{}'); } catch { return {}; }
  });
  const [fiscalYear, setFiscalYear] = useState<number>(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 4 ? year : year - 1;
  });
  const [filterType, setFilterType] = useState<'current' | 'all'>('current');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const steps = ["AI接続中...", "資料解析中...", "問題案の作成中...", "内容の最終調整中...", "検証完了"];

  const handleSelectTraining = (t: Training) => {
    setEditingTraining(t);
    setTitle(t.title);
    setDate(t.date);
    setContent(t.description);
    setMaterials(t.materials || []);
    setTargetEmployees(t.targetEmployees || []);
    setTargetDepartments(t.targetDepartments || []);
    setTargetPositions(t.targetPositions || []);
    // ローカルストレージからフラグを読み込む（GAS同期で失われないよう）
    const flagsFromStorage: Record<string, { isRequiredForAll: boolean; fiscalYear?: number }> = JSON.parse(localStorage.getItem('sb_training_flags') || '{}');
    setIsRequiredForAll(flagsFromStorage[t.id]?.isRequiredForAll ?? t.isRequiredForAll ?? false);
    setFiscalYear(flagsFromStorage[t.id]?.fiscalYear ?? t.fiscalYear ?? getCurrentFiscalYear());
    setStudyLinks(t.studyLinks || []);

    const pattern = t.patterns.find(p => p.id === t.activePatternId) || t.patterns[0];
    if (pattern) {
      setEditingQuestions(JSON.parse(JSON.stringify(pattern.questions)));
      setCurrentPatternId(pattern.id);
    } else {
      setEditingQuestions([]);
      setCurrentPatternId('');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateQuestionField = (idx: number, field: keyof Question, value: any) => {
    const next = [...editingQuestions];
    next[idx] = { ...next[idx], [field]: value };
    setEditingQuestions(next);
  };

  const updateOptionText = (qIdx: number, oIdx: number, value: string) => {
    const next = [...editingQuestions];
    const opts = [...next[qIdx].options];
    opts[oIdx] = value;
    next[qIdx].options = opts;
    setEditingQuestions(next);
  };

  const handleSaveAllChanges = () => {
    if (!title) return alert('研修タイトルを入力してください。');
    if (editingQuestions.length === 0) return alert('保存する問題がありません。');

    const patternId = (currentPatternId && currentPatternId !== 'AI_TEMP' && currentPatternId !== 'CSV_TEMP') ? currentPatternId : "PT-" + Math.random().toString(36).substring(2, 7).toUpperCase();

    const newPattern: TestPattern = {
      id: patternId,
      name: `テスト問題セット`,
      questions: editingQuestions,
      createdAt: new Date().toISOString()
    };

    let updated: Training;
    if (editingTraining) {
      const updatedPatterns = editingTraining.patterns.map(p => p.id === patternId ? newPattern : p);
      if (!editingTraining.patterns.find(p => p.id === patternId)) {
        updatedPatterns.push(newPattern);
      }
      updated = {
        ...editingTraining,
        title,
        date,
        description: content,
        materials: materials,
        patterns: updatedPatterns,
        activePatternId: patternId,
        targetEmployees,
        targetDepartments,
        targetPositions,
        isRequiredForAll,
        studyLinks,
        fiscalYear
      };
    } else {
      updated = {
        id: "TR-" + Math.random().toString(36).substring(2, 7).toUpperCase(),
        title,
        date,
        description: content,
        materials: materials,
        patterns: [newPattern],
        activePatternId: patternId,
        targetEmployees,
        targetDepartments,
        targetPositions,
        isRequiredForAll,
        studyLinks,
        fiscalYear
      };
    }

    onUpdateTraining(updated);
    // isRequiredForAll と studyLinks, fiscalYear をローカルに永続化（GAS同期で失われないよう）
    const newFlags = { ...trainingFlags, [updated.id]: { isRequiredForAll, studyLinks, fiscalYear } };
    setTrainingFlags(newFlags);
    localStorage.setItem('sb_training_flags', JSON.stringify(newFlags));
    setEditingTraining(updated);
    setCurrentPatternId(patternId);
    alert('研修情報と全問題を保存しました。受講者画面に反映されます。');
  };

  const handleGenerate = async () => {
    if (!title) return alert('研修タイトルを入力してください');
    setIsGenerating(true);
    setGenStep(0);
    const timer = setInterval(() => setGenStep(p => (p < steps.length - 1 ? p + 1 : p)), 2500);
    try {
      const qs = await generateQuestionsFromMaterials(title, content, materials, questionCount, difficulty, modelName);
      console.log('✅ 問題生成完了:', qs.length, '問');
      console.log('問題データ:', qs);

      setEditingQuestions(qs);
      setCurrentPatternId('AI_TEMP');

      console.log('✅ 編集状態を更新しました');

      // Show success message with material processing info
      const message = materials.length > 0
        ? `${qs.length}問の問題を生成しました。\n\n資料: ${materials.length}件を処理しました。\n詳細はブラウザのコンソールをご確認ください。`
        : `${qs.length}問の問題を生成しました。\n\n下にスクロールして内容を確認してください。`;
      alert(message);

      // Scroll to the editing area after a short delay to ensure rendering
      setTimeout(() => {
        const editingArea = document.querySelector('.editing-area-marker');
        if (editingArea) {
          console.log('📍 編集エリアにスクロールします');
          editingArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          console.warn('⚠️ 編集エリアが見つかりませんでした');
        }
      }, 300);
    } catch (e: any) {
      console.error('AI生成エラー:', e);
      const errorMessage = e?.message || 'AI生成エラーが発生しました。';
      alert(`エラー: ${errorMessage}\n\nAPIキーの設定やネットワーク接続を確認してください。`);
    } finally {
      setIsGenerating(false);
      clearInterval(timer);
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split(/\r?\n/).filter(row => row.trim() !== "");
      const dataRows = rows.slice(1);
      const parsedQuestions: Question[] = dataRows.map((row, index) => {
        const cols = row.split(',').map(c => c.replace(/^"(.*)"$/, '$1').trim());
        let correctIdx = 0;
        const correctRaw = cols[6] || "1";
        const match = correctRaw.match(/\d+/);
        if (match) {
          correctIdx = Math.max(0, Math.min(3, parseInt(match[0]) - 1));
        }

        return {
          id: cols[0] || `CSV-${index + 1}`,
          question: cols[1] || `問題 ${index + 1}`,
          options: [
            cols[2] || "選択肢1",
            cols[3] || "選択肢2",
            cols[4] || "選択肢3",
            cols[5] || "選択肢4"
          ],
          correctAnswer: correctIdx,
          explanation: cols[7] || ""
        };
      });

      if (parsedQuestions.length > 0) {
        setEditingQuestions(parsedQuestions);
        setCurrentPatternId('CSV_TEMP');
        alert(`${parsedQuestions.length}件の問題を読み込みました。内容を確認して保存してください。`);
      }
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (materials.length + files.length > 10) {
      alert("資料は最大10個までです。");
      return;
    }

    const newMaterials: TrainingMaterial[] = [];
    let skippedFiles = 0;

    for (const f of files) {
      try {
        const material = await new Promise<TrainingMaterial>((resolve, reject) => {
          const reader = new FileReader();

          reader.onload = (e) => {
            const result = e.target?.result as string;
            if (!result || !result.includes(',')) {
              reject(new Error('ファイルの読み込みに失敗しました'));
              return;
            }
            resolve({
              name: f.name,
              mimeType: f.type || 'application/octet-stream',
              data: result
            });
          };

          reader.onerror = () => {
            reject(new Error('ファイルの読み込み中にエラーが発生しました'));
          };

          reader.readAsDataURL(f);
        });

        newMaterials.push(material);
      } catch (error) {
        console.error(`ファイル "${f.name}" の読み込みに失敗しました:`, error);
        skippedFiles++;
      }
    }

    if (newMaterials.length > 0) {
      setMaterials(prev => [...prev, ...newMaterials]);
    }

    if (skippedFiles > 0) {
      alert(`${newMaterials.length}件のファイルを追加しました。\n${skippedFiles}件のファイルはスキップされました。`);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMaterial = (index: number) => {
    setMaterials(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzeWrongAnswers = (training: Training) => {
    const trainingResults = results.filter(r => r.trainingId === training.id && r.postScore !== -1);

    if (trainingResults.length === 0) {
      alert('この研修の受講者データがありません。');
      return;
    }

    const activePattern = training.patterns.find(p => p.id === training.activePatternId) || training.patterns[0];
    const questions = activePattern?.questions || [];

    const analyses: WrongAnswerAnalysis[] = questions.map((q, qIdx) => {
      const wrongEmployees: { employeeId: string; employeeName: string; selectedAnswer: number }[] = [];

      trainingResults.forEach(result => {
        const userAnswer = result.userAnswers?.[qIdx];
        if (userAnswer !== undefined && userAnswer !== q.correctAnswer) {
          wrongEmployees.push({
            employeeId: result.employeeId,
            employeeName: result.employeeName,
            selectedAnswer: userAnswer
          });
        }
      });

      const wrongCount = wrongEmployees.length;
      const totalAttempts = trainingResults.length;
      const wrongRate = totalAttempts > 0 ? Math.round((wrongCount / totalAttempts) * 100) : 0;

      return {
        id: `${training.id}_Q${qIdx}_${new Date().getTime()}`,
        trainingId: training.id,
        trainingTitle: training.title,
        questionIndex: qIdx,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        wrongCount,
        wrongEmployees,
        totalAttempts,
        wrongRate,
        analyzedAt: new Date().toISOString()
      };
    });

    // Sort by wrong rate (highest first)
    const sortedAnalyses = analyses.sort((a, b) => b.wrongRate - a.wrongRate);
    setWrongAnswerData(sortedAnalyses);
    setShowWrongAnswerModal(true);

    // Save the top wrong answers
    sortedAnalyses.slice(0, 5).forEach(analysis => {
      if (analysis.wrongRate > 0) {
        onSaveWrongAnswerAnalysis(analysis);
      }
    });
  };

  const handleFetchFromUrl = async () => {
    if (!urlInput.trim()) {
      alert('URLを入力してください。');
      return;
    }

    setIsFetchingUrl(true);
    try {
      console.log('🌐 URLからコンテンツを取得中:', urlInput);

      // Use a CORS proxy or backend to fetch content
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(urlInput)}`);
      const data = await response.json();

      if (!data.contents) {
        throw new Error('コンテンツの取得に失敗しました。URLが公開されているか確認してください。');
      }

      console.log('✓ HTMLコンテンツを取得しました (サイズ:', data.contents.length, 'バイト)');

      // Extract text from HTML (improved extraction)
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.contents, 'text/html');

      // Remove script and style elements
      const scripts = doc.querySelectorAll('script, style, nav, header, footer');
      scripts.forEach(el => el.remove());

      // Get text content from main content areas
      let textContent = '';
      const mainContent = doc.querySelector('main, article, .content, #content, [role="main"]');
      if (mainContent) {
        textContent = mainContent.textContent || '';
        console.log('✓ メインコンテンツエリアから抽出しました');
      } else {
        textContent = doc.body.textContent || '';
        console.log('✓ body全体から抽出しました');
      }

      // Clean up whitespace but preserve paragraphs
      const cleanedText = textContent
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim()
        .substring(0, 20000); // Increased from 5000 to 20000 characters

      console.log('✓ テキストを整形しました (長さ:', cleanedText.length, '文字)');

      if (!cleanedText || cleanedText.length < 10) {
        throw new Error('有効なテキストコンテンツが見つかりませんでした。別の方法でコンテンツを取得してください。');
      }

      // Add to content field
      setContent(prev => prev ? `${prev}\n\n【URLから取得: ${urlInput}】\n${cleanedText}` : cleanedText);

      // Add as a material with proper validation
      try {
        const base64Content = btoa(unescape(encodeURIComponent(cleanedText)));
        const urlMaterial: TrainingMaterial = {
          name: `URL: ${urlInput.substring(0, 50)}${urlInput.length > 50 ? '...' : ''}`,
          mimeType: 'text/plain',
          data: `data:text/plain;base64,${base64Content}`
        };

        // Validate the material before adding
        if (urlMaterial.data && urlMaterial.data.includes(',')) {
          setMaterials(prev => [...prev, urlMaterial]);
          setUrlInput('');
          alert(`✅ URLからコンテンツを取得しました!\n\n取得した文字数: ${cleanedText.length}文字\n\nテキストエリアと資料リストに追加されました。`);
          console.log('✅ 資料として追加しました');
        } else {
          throw new Error('資料データの形式が不正です。');
        }
      } catch (encodeError) {
        console.error('エンコードエラー:', encodeError);
        alert('テキストのエンコードに失敗しました。コンテンツフィールドには追加されています。');
        setUrlInput('');
      }
    } catch (error) {
      console.error('URL fetch error:', error);
      const errorMsg = error instanceof Error ? error.message : 'URLからの取得に失敗しました。';
      alert(`${errorMsg}\n公開されているページのURLか確認してください。`);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const getCurrentFiscalYear = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 4 ? year : year - 1;
  };

  const getTermFromFiscalYear = (fy: number) => fy - 1976;

  const currentFY = getCurrentFiscalYear();

  const filteredTrainings = trainings.filter(t => {
    if (filterType === 'all') return true;
    const tFY = trainingFlags[t.id]?.fiscalYear ?? t.fiscalYear ?? currentFY;
    return tFY === currentFY;
  });

  return (
    <div className="space-y-6 md:space-y-8 animate-fadeIn pb-16 md:pb-20">
      {/* Wrong Answer Analysis Modal */}
      {showWrongAnswerModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 md:p-8 border-b bg-gradient-to-r from-rose-600 to-orange-600 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl md:text-2xl font-black">誤答傾向分析</h3>
                <p className="text-xs md:text-sm font-bold opacity-90 mt-1">多くの人が間違えた問題（誤答率 高→低順）</p>
              </div>
              <button onClick={() => setShowWrongAnswerModal(false)} className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-black transition-all">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              {wrongAnswerData.map((analysis, idx) => (
                <div key={idx} className="p-6 md:p-8 bg-slate-50 rounded-2xl border-2 border-slate-100 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-black text-white bg-rose-600 px-3 py-1 rounded-full">Q{analysis.questionIndex + 1}</span>
                        <span className="text-xs font-black text-rose-600 bg-rose-100 px-3 py-1 rounded-full">誤答率 {analysis.wrongRate}%</span>
                        <span className="text-[10px] font-bold text-slate-400">{analysis.wrongCount}/{analysis.totalAttempts}人が誤答</span>
                      </div>
                      <h4 className="text-base md:text-lg font-bold text-slate-800 leading-relaxed">{analysis.question}</h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {analysis.options.map((opt, oIdx) => {
                      const isCorrect = oIdx === analysis.correctAnswer;
                      const wrongCount = analysis.wrongEmployees.filter(e => e.selectedAnswer === oIdx).length;
                      return (
                        <div key={oIdx} className={`p-3 rounded-xl border-2 flex items-center justify-between ${isCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{String.fromCharCode(65 + oIdx)}</span>
                            <span className={`text-sm font-bold ${isCorrect ? 'text-emerald-800' : 'text-slate-600'}`}>{opt}</span>
                          </div>
                          {wrongCount > 0 && !isCorrect && (
                            <span className="text-[10px] font-black text-rose-600 bg-rose-100 px-2 py-1 rounded">{wrongCount}人</span>
                          )}
                          {isCorrect && <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded">正解</span>}
                        </div>
                      );
                    })}
                  </div>

                  {analysis.explanation && (
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                      <p className="text-[10px] font-black text-blue-400 uppercase mb-1">解説</p>
                      <p className="text-xs text-blue-900 leading-relaxed">{analysis.explanation}</p>
                    </div>
                  )}

                  {analysis.wrongEmployees.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-[10px] font-black text-amber-600 uppercase mb-2">誤答者</p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.wrongEmployees.map((emp, empIdx) => (
                          <span key={empIdx} className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
                            {emp.employeeName} <span className="text-[10px]">(選択: {String.fromCharCode(65 + emp.selectedAnswer)})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {wrongAnswerData.length === 0 && (
                <div className="text-center py-20 text-slate-300 font-bold">
                  分析データなし
                </div>
              )}
            </div>
            <div className="p-6 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setShowWrongAnswerModal(false)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black hover:bg-slate-800 transition-all">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Past Trainings Selection */}
      <section className="bg-slate-900 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl text-white space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h3 className="text-lg md:text-xl font-black flex items-center gap-3">
            <div className="w-1.5 h-6 md:w-2 md:h-8 bg-amber-400 rounded-full"></div>
            過去の研修・問題を編集する
          </h3>
          <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700">
            <button
              onClick={() => setFilterType('current')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'current' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              {getTermFromFiscalYear(currentFY)}年度分
            </button>
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              通算分
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 overflow-x-auto">
          {[...filteredTrainings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => {
            const isAllRequired = trainingFlags[t.id]?.isRequiredForAll ?? t.isRequiredForAll ?? false;
            const tFY = trainingFlags[t.id]?.fiscalYear ?? t.fiscalYear ?? currentFY;
            return (
              <div key={t.id} className={`p-4 md:p-5 rounded-xl md:rounded-2xl text-left transition-all border-2 flex flex-col justify-between h-32 md:h-36 cursor-pointer ${editingTraining?.id === t.id ? 'bg-indigo-600 border-white shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`} onClick={() => handleSelectTraining(t)}>
                <div className="space-y-1">
                  <div className="font-black text-xs md:text-sm truncate w-full">{t.title}</div>
                  <div className="flex gap-1 flex-wrap">
                    {isAllRequired && (
                      <span className="inline-block text-[8px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full">🔴 全員必須</span>
                    )}
                    <span className="inline-block text-[8px] font-black bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full">{getTermFromFiscalYear(tFY)}年度</span>
                  </div>
                </div>
                <div className="flex justify-between items-end gap-2">
                  <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.date}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAnalyzeWrongAnswers(t); }}
                      className="text-[9px] md:text-[10px] bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded font-black transition-all"
                    >
                      X傘向
                    </button>
                    <span className="text-[9px] md:text-[10px] bg-slate-700 px-2 py-1 rounded">編集 &gt;</span>
                  </div>
                </div>
              </div>
            );
          })}
          <button onClick={() => { setEditingTraining(null); setTitle(''); setDate(new Date().toISOString().split('T')[0]); setContent(''); setMaterials([]); setEditingQuestions([]); setCurrentPatternId(''); }} className="p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-700 text-slate-500 font-bold hover:text-white hover:border-indigo-500 flex items-center justify-center gap-2 transition-all h-28 md:h-32">
            <span>＋</span> 新規作成
          </button>
        </div>
      </section>

      {/* Main Form */}
      <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-6 md:p-10 border shadow-sm space-y-8 md:space-y-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 md:pb-6 gap-2">
          <h2 className="text-xl md:text-2xl font-black text-slate-800">{editingTraining ? '研修詳細の修正' : '新規研修の登録'}</h2>
          {editingTraining && <span className="text-[10px] md:text-xs font-black text-indigo-600 bg-indigo-50 px-3 md:px-4 py-1 md:py-2 rounded-full">ID: {editingTraining.id}</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          <div className="space-y-2">
            <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest ml-1">研修名</label>
            <input type="text" placeholder="例: セキュリティ研修 2024" className="w-full px-4 md:px-6 py-3 md:py-4 rounded-xl border-2 font-bold focus:border-indigo-500 outline-none transition-all text-sm md:text-base" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest ml-1">実施日</label>
            <input type="date" className="w-full px-4 md:px-6 py-3 md:py-4 rounded-xl border-2 font-bold focus:border-indigo-500 outline-none transition-all text-sm md:text-base" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {/* 年度設定 */}
          <div className="space-y-2">
            <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest ml-1">設定年度</label>
            <div className="flex gap-2">
              <select
                value={fiscalYear}
                onChange={e => setFiscalYear(parseInt(e.target.value))}
                className="flex-1 px-4 py-3 md:py-4 rounded-xl border-2 font-black text-sm outline-none focus:border-indigo-500 transition-all"
              >
                {Array.from({ length: 5 }, (_, i) => currentFY - 2 + i).map(y => (
                  <option key={y} value={y}>{getTermFromFiscalYear(y)}年度 ({y}年4月〜)</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest ml-1">必須設定</label>
            <button
              type="button"
              onClick={() => setIsRequiredForAll(!isRequiredForAll)}
              className={`w-full px-4 py-3 md:py-4 rounded-xl border-2 font-black text-xs md:text-sm transition-all ${isRequiredForAll
                ? 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-100'
                : 'bg-white text-slate-400 border-slate-200 hover:border-rose-300'
                }`}
            >
              {isRequiredForAll ? '🔴 全員必須（クリックで解除）' : '⚪ 全員必須にする'}
            </button>
          </div>
          {/* 勉強資料リンク */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest ml-1">📚 勉強資料リンク（最大5つ）</label>
            <div className="space-y-2 bg-slate-50 p-3 rounded-xl">
              {studyLinks.map((link, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="ラベル"
                    className="w-1/3 px-3 py-2 rounded-lg border text-xs font-bold"
                    value={link.label}
                    onChange={e => {
                      const updated = [...studyLinks];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setStudyLinks(updated);
                    }}
                  />
                  <input
                    type="url"
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 rounded-lg border text-xs font-bold"
                    value={link.url}
                    onChange={e => {
                      const updated = [...studyLinks];
                      updated[idx] = { ...updated[idx], url: e.target.value };
                      setStudyLinks(updated);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setStudyLinks(studyLinks.filter((_, i) => i !== idx))}
                    className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 font-black text-xs flex items-center justify-center hover:bg-rose-200 transition-all"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {studyLinks.length < 5 && (
                <button
                  type="button"
                  onClick={() => setStudyLinks([...studyLinks, { label: '', url: '' }])}
                  className="w-full px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg text-xs font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all"
                >
                  ＋ リンクを追加
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">問題数</label>
            <div className="flex items-center gap-4">
              <input type="range" min="1" max="50" value={questionCount} onChange={e => setQuestionCount(parseInt(e.target.value))} className="flex-1 accent-indigo-600" />
              <span className="text-lg font-black text-indigo-600 w-8">{questionCount}</span>
            </div>
          </div>

          <div className="border-t pt-4 flex justify-between items-center">
            <div className="text-[10px] text-slate-400 font-bold">AI API Key</div>
            <button onClick={onOpenSelectKey} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg">キー設定</button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest ml-1">講義の要点・AIへの指示・テキスト資料</label>
          <p className="text-[9px] text-slate-400 font-bold ml-1">💡 NotebookLMからの要約をここにペーストできます</p>
          <textarea
            placeholder="講義の内容や、AIに重視してほしいポイントを入力してください。&#10;NotebookLMで作成した要約や資料をここに直接ペーストすることもできます。"
            className="w-full px-4 md:px-6 py-3 md:py-4 rounded-xl border-2 h-40 md:h-48 font-medium focus:border-indigo-500 outline-none transition-all text-sm md:text-base resize-y"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </div>

        {/* Materials */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">資料アップロード</label>
            <span className="text-[10px] md:text-xs font-bold text-indigo-600">{materials.length} / 10</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl md:rounded-3xl p-6 md:p-8 flex flex-col items-center justify-center gap-2 md:gap-3 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all group">
              <svg className="w-8 h-8 md:w-10 md:h-10 text-slate-300 group-hover:text-indigo-500 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              <p className="text-xs md:text-sm font-bold text-slate-400 group-hover:text-indigo-600">ファイルを追加</p>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" accept=".pdf,.doc,.docx,.txt,.jpg,.png" />
            </div>
            <div className="space-y-2 max-h-[140px] md:max-h-[180px] overflow-y-auto pr-2 scrollbar-hide">
              {materials.length > 0 ? materials.map((m, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 md:p-4 bg-slate-50 border border-slate-100 rounded-xl md:rounded-2xl animate-fadeIn">
                  <span className="text-[10px] md:text-xs font-bold text-slate-600 truncate max-w-[80%]">{m.name}</span>
                  <button onClick={() => removeMaterial(idx)} className="text-slate-300 hover:text-rose-500">
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )) : (
                <div className="h-full flex items-center justify-center text-slate-300 text-[10px] md:text-xs italic border-2 border-slate-50 rounded-2xl md:rounded-3xl p-6">資料なし</div>
              )}
            </div>
          </div>
        </div>

        {/* URL Input */}
        <div className="space-y-4 border-t pt-6">
          <div className="flex justify-between items-center px-1">
            <div>
              <label className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">URLから資料を取得</label>
              <p className="text-[9px] text-slate-400 font-bold mt-0.5">公開されているWebページのURLを入力</p>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="url"
              placeholder="https://example.com/article"
              className="flex-1 px-4 py-3 rounded-xl border-2 font-medium focus:border-indigo-500 outline-none transition-all text-sm"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleFetchFromUrl()}
            />
            <button
              onClick={handleFetchFromUrl}
              disabled={isFetchingUrl || !urlInput.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center gap-2"
            >
              {isFetchingUrl ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  取得中...
                </>
              ) : (
                <>🌐 取得</>
              )}
            </button>
          </div>
          <p className="text-[9px] text-blue-600 font-bold">💡 公開されているWebページやNotebookLMの共有URLを入力できます。取得に失敗する場合は、テキストエリアに直接ペーストしてください。</p>
        </div>

        {/* Actions */}
        <div className="p-6 md:p-8 bg-indigo-50 rounded-2xl md:rounded-3xl border-2 border-indigo-100 space-y-4 md:space-y-6">
          <p className="font-black text-indigo-800 italic text-center text-xs md:text-sm">モデル・難易度・問題数を選択してAI生成</p>
          <div className="flex flex-col gap-3 md:gap-4 max-w-2xl mx-auto">
            <div className="flex gap-2">
              {['gemini-2.5-flash', 'gemini-3-flash-preview'].map(m => (
                <button key={m} onClick={() => setModelName(m)} className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl font-black border-2 transition-all text-xs ${modelName === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>{m.includes('3-flash') ? 'Gemini 3 Flash' : 'Gemini 2.5 Flash'}</button>
              ))}
            </div>
            <div className="flex gap-2">
              {(['Standard', 'Difficult', 'MAX'] as const).map(d => (
                <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl font-black border-2 transition-all text-xs ${difficulty === d ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-400 border-slate-200'}`}>{d === 'Standard' ? '標準' : d === 'Difficult' ? '難しい' : 'MAX難しい'}</button>
              ))}
            </div>
            <div className="flex gap-2">
              {[10, 20, 50].map(c => (
                <button key={c} onClick={() => setQuestionCount(c)} className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl font-black border-2 transition-all text-sm ${questionCount === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-200'}`}>{c}問</button>
              ))}
            </div>
            <button onClick={handleGenerate} disabled={isGenerating || !title} className="w-full py-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black text-sm md:text-base hover:bg-indigo-700 disabled:bg-indigo-200 shadow-lg">
              {isGenerating ? steps[genStep] : "AIで問題案を作成"}
            </button>
            <div className="w-full">
              <input type="file" ref={csvInputRef} onChange={handleCsvImport} className="hidden" accept=".csv" />
              <button
                onClick={() => csvInputRef.current?.click()}
                className="w-full py-3 md:py-4 bg-white text-slate-600 border-2 border-slate-200 rounded-xl md:rounded-2xl font-black hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
                CSVインポート
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Editing Area */}
      {editingQuestions.length > 0 && (
        <div className="space-y-6 md:space-y-10 animate-slideUp editing-area-marker">
          <div className="flex flex-col md:flex-row justify-between items-center bg-emerald-600 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl gap-4 md:gap-6">
            <div className="text-white text-center md:text-left">
              <h3 className="text-lg md:text-2xl font-black">内容を最終確認・修正</h3>
              <p className="font-bold opacity-80 italic text-[10px] md:text-xs">最後に下の「保存」ボタンで確定してください。</p>
            </div>
            <button onClick={handleSaveAllChanges} className="w-full md:w-auto px-8 md:px-16 py-4 md:py-6 bg-white text-emerald-700 rounded-xl md:rounded-[2rem] font-black text-base md:text-xl shadow-xl">
              すべて保存
            </button>
          </div>

          <div className="space-y-6 md:space-y-8">
            {editingQuestions.map((q, qIdx) => (
              <div key={qIdx} className="p-6 md:p-10 bg-white rounded-[2rem] md:rounded-[3rem] border-2 border-slate-100 shadow-sm space-y-6 md:space-y-8 hover:border-indigo-400 transition-all">
                <div className="flex flex-col sm:flex-row gap-4 md:gap-8">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl md:text-2xl shrink-0 shadow-lg">Q{qIdx + 1}</div>
                  <div className="flex-1 space-y-2">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">問題文</label>
                    <textarea className="w-full p-4 md:p-6 rounded-xl md:rounded-2xl border-2 border-slate-100 font-bold text-lg md:text-xl focus:border-indigo-500 outline-none bg-slate-50/30" value={q.question} onChange={e => updateQuestionField(qIdx, 'question', e.target.value)} rows={2} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 sm:pl-16 md:pl-24">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className={`flex items-center gap-3 md:gap-4 p-4 md:p-5 rounded-xl md:rounded-2xl border-2 transition-all ${q.correctAnswer === oIdx ? 'border-emerald-500 bg-emerald-50 ring-2 md:ring-4 ring-emerald-100' : 'border-slate-100 hover:border-indigo-200'}`}>
                      <input type="radio" checked={q.correctAnswer === oIdx} onChange={() => updateQuestionField(qIdx, 'correctAnswer', oIdx)} className="w-5 h-5 md:w-6 md:h-6 accent-emerald-600 cursor-pointer" />
                      <div className="flex-1">
                        <label className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase block mb-0.5">選択肢 {String.fromCharCode(65 + oIdx)}</label>
                        <input type="text" className="w-full bg-transparent border-none p-0 font-bold text-slate-800 outline-none text-sm md:text-base" value={opt} onChange={e => updateOptionText(qIdx, oIdx, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sm:pl-16 md:pl-24 space-y-2">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">正解の解説</label>
                  <textarea className="w-full p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 text-[10px] md:text-sm text-slate-600 bg-slate-50/30 outline-none focus:border-indigo-400 italic font-medium" value={q.explanation} onChange={e => updateQuestionField(qIdx, 'explanation', e.target.value)} rows={2} />
                </div>
              </div>
            ))}
          </div>

          <div className="text-center pt-6 md:pt-10">
            <button onClick={handleSaveAllChanges} className="w-full max-w-2xl py-6 md:py-8 bg-emerald-600 text-white rounded-2xl md:rounded-[3rem] font-black text-xl md:text-3xl shadow-2xl hover:bg-emerald-700 active:scale-95 transition-all">
              保存・配信を開始
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
