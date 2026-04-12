
import React, { useState } from 'react';
import { TestResult, Training, Employee, Role, DeepAnalysisRecord, WrongAnswerAnalysis, PsychApplication } from '../../types';
import { analyzeHRCompetency, extractPsychModsFromAnalysis } from '../../services/geminiService';
import { HRIndividualManager } from './HRIndividualManager';

interface ReportingDashboardProps {
  trainings: Training[];
  results: TestResult[];
  employees: Employee[];
  hrAnalyses: DeepAnalysisRecord[];
  wrongAnswerAnalyses: WrongAnswerAnalysis[];
  onUpdateEmployeeRole: (employeeId: string, newRole: Role) => void;
  onRefresh: () => void;
  gasUrl: string;
  onUpdateGasUrl: (url: string) => void;
  clliqUrl: string;
  onUpdateClliqUrl: (url: string) => void;
  onSaveHRAnalysis: (record: Omit<DeepAnalysisRecord, 'id'>) => Promise<void>;
  onRunManualAnalysis: (res: TestResult) => Promise<void>;
  onImpersonate: (employeeId: string) => void;
  onOpenSelectKey: () => Promise<void>;
  annualSummaries?: any[];
  psychApplications: PsychApplication[];
  onDeletePsychApplication: (employeeId: string) => Promise<void>;
  currentEmployeeId?: string; // ログイン中の社員ID（プライバシー制御用）
  isHRRole?: boolean; // HR権限かどうか（全員分析を閲覧可）
}

// preScore と postScore が両方とも有効な数値であれば「受講済み」と判定
const isCompleted = (result: TestResult | undefined): boolean => {
  if (!result) return false;
  const pre = result.preScore;
  const post = result.postScore;
  return (
    pre !== null && pre !== undefined && typeof pre === 'number' && pre !== -1 &&
    post !== null && post !== undefined && typeof post === 'number' && post !== -1
  );
};

export const ReportingDashboard: React.FC<ReportingDashboardProps> = ({ trainings, results, employees, hrAnalyses, wrongAnswerAnalyses, onUpdateEmployeeRole, onRefresh, gasUrl, onUpdateGasUrl, clliqUrl, onUpdateClliqUrl, onSaveHRAnalysis, onRunManualAnalysis, onImpersonate, onOpenSelectKey, annualSummaries, psychApplications, onDeletePsychApplication, currentEmployeeId, isHRRole }) => {
  const [viewMode, setViewMode] = useState<'employees' | 'growth' | 'hr_mgmt' | 'setup' | 'deadlines' | 'individual'>('growth');
  const [localUrl, setLocalUrl] = useState(gasUrl);
  const [localClliqUrl, setLocalClliqUrl] = useState(clliqUrl);
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);

  // Sorting and filtering states
  const [sortBy, setSortBy] = useState<'name' | 'lecture' | 'date'>('date');
  const [searchName, setSearchName] = useState('');
  const [searchLecture, setSearchLecture] = useState('');

  // Deadline management states
  const [deadlines, setDeadlines] = useState<{ trainingId: string, deadline1: string, deadline2: string }[]>(() => {
    try {
      const saved = localStorage.getItem('sb_deadlines');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [hrAnalysisResult, setHrAnalysisResult] = useState<string>('');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedHrAnalysis, setSelectedHrAnalysis] = useState<DeepAnalysisRecord | null>(null);
  // 年度設定（一括分析・新規分析で使用）
  const [analysisFiscalYear, setAnalysisFiscalYear] = useState<number>(48);

  const gasSourceCode = `/**
 * HR Analytics App - Backend Source Code (v1.3.1)
 * Added studyLinks support for training materials
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const VERSION = "1.3.1";

const SHEETS = {
    EMPLOYEES: SS.getSheetByName('EMPLOYEES'),
    TRAININGS: SS.getSheetByName('TRAININGS'),
    QUESTIONS: SS.getSheetByName('QUESTIONS'),
    RESULTS: SS.getSheetByName('RESULTS'),
    HR_ANALYSES: SS.getSheetByName('HR_ANALYSES'),
    ANNOUNCEMENTS: SS.getSheetByName('ANNOUNCEMENTS')
};

function doGet(e) {
    const type = e.parameter.type;
    if (type === 'GET_VERSION') return res({ version: VERSION });

    const sheet = SHEETS[type.replace('GET_', '')];
    if (!sheet) return res([]);

    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const result = data.map(row => {
        const obj = {};
        headers.forEach((h, i) => {
            const key = h.toString().toLowerCase().replace(/[\\s_]/g, '');
            obj[key] = row[i];
        });
        return obj;
    }).filter(row => Object.values(row).some(v => v !== ""));
    return res(result);
}

function doPost(e) {
    const payload = JSON.parse(e.postData.contents);
    const type = payload.type;

    if (type === 'ADD_EMPLOYEE') {
        const emp = payload.employee;
        const secret = emp.otpSecret || emp.otpsecret || "";
        const required = emp.requiredTrainings || "[]";
        const challenge = emp.challengeTrainings || "[]";
        const dept = emp.department || "";
        const pos = emp.position || "";
        upsertRow(SHEETS.EMPLOYEES, 0, emp.id, [emp.id, emp.name, emp.role, emp.password, secret, new Date().toISOString(), required, challenge, dept, pos]);
    } else if (type === 'UPDATE_EMPLOYEE') {
        const emp = payload.employee;
        const data = SHEETS.EMPLOYEES.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            if (data[i][0] == emp.id) {
                const row = i + 1;
                SHEETS.EMPLOYEES.getRange(row, 2).setValue(emp.name);
                SHEETS.EMPLOYEES.getRange(row, 3).setValue(emp.role);
                if (emp.password) SHEETS.EMPLOYEES.getRange(row, 4).setValue(emp.password);
                if (emp.otpSecret) SHEETS.EMPLOYEES.getRange(row, 5).setValue(emp.otpSecret);
                SHEETS.EMPLOYEES.getRange(row, 7).setValue(emp.requiredTrainings || "[]");
                SHEETS.EMPLOYEES.getRange(row, 8).setValue(emp.challengeTrainings || "[]");
                SHEETS.EMPLOYEES.getRange(row, 9).setValue(emp.department || "");
                SHEETS.EMPLOYEES.getRange(row, 10).setValue(emp.position || "");
                break;
            }
        }
    } else if (type === 'DELETE_EMPLOYEE') {
        const data = SHEETS.EMPLOYEES.getDataRange().getValues();
        for (let i = data.length - 1; i >= 1; i--) {
            if (data[i][0] == payload.employeeId) {
                SHEETS.EMPLOYEES.deleteRow(i + 1);
                break;
            }
        }
    } else if (type === 'UPDATE_EMPLOYEE_ROLE') {
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 2, payload.role);
    } else if (type === 'UPDATE_LAST_ACTIVE') {
        updateRow(SHEETS.EMPLOYEES, 0, payload.employeeId, 5, new Date().toISOString());
    } else if (type === 'SAVE_HR_ANALYSIS') {
        const h = payload.record;
        SHEETS.HR_ANALYSES.appendRow([Utilities.getUuid(), h.employeeId, h.employeeName, h.date, h.content, h.instructionUsed]);
    } else if (type === 'AUTO_SYNC_RESULT') {
        const d = payload.data;
        SHEETS.RESULTS.appendRow([d.trainingid, d.trainingtitle, d.employeeid, d.employeename, d.prescore, d.postscore, d.useranswers, d.analysis, d.advice, d.date, d.traits, d.competencies]);
    } else if (type === 'SAVE_TRAINING_V2') {
        const t = payload.training;
        const qs = payload.questions;
        const targetEmps = t.targetEmployees ? JSON.stringify(t.targetEmployees) : "[]";
        const targetDepts = t.targetDepartments ? JSON.stringify(t.targetDepartments) : "[]";
        const targetPos = t.targetPositions ? JSON.stringify(t.targetPositions) : "[]";
        const studyLinksJson = t.studyLinks ? JSON.stringify(t.studyLinks) : "[]";

        upsertRow(SHEETS.TRAININGS, 0, t.id, [t.id, t.title, t.date, t.description, t.materials_json, targetEmps, targetDepts, targetPos, studyLinksJson]);

        // Clear and rewrite questions for this training
        const qData = SHEETS.QUESTIONS.getDataRange().getValues();
        for (let i = qData.length - 1; i >= 1; i--) {
            if (qData[i][1] == t.id) SHEETS.QUESTIONS.deleteRow(i + 1);
        }
        qs.forEach(q => SHEETS.QUESTIONS.appendRow([q.id, t.id, q.question, q.options_json, q.correctAnswer, q.explanation]));
    } else if (type === 'SAVE_ANNOUNCEMENT') {
        const a = payload.announcement;
        SHEETS.ANNOUNCEMENTS.appendRow([a.id, a.title, a.content, a.createdAt, a.createdBy, a.priority, a.active]);
    } else if (type === 'TOGGLE_ANNOUNCEMENT') {
        updateRow(SHEETS.ANNOUNCEMENTS, 0, payload.id, 6, payload.active);
    }
    return res({ success: true });
}

function res(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function updateRow(sheet, keyCol, keyVal, targetCol, newVal) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][keyCol] == keyVal) {
            sheet.getRange(i + 1, targetCol + 1).setValue(newVal);
            return true;
        }
    }
    return false;
}

function upsertRow(sheet, keyCol, keyVal, newRow) {
    if (!updateRow(sheet, keyCol, keyVal, 0, newRow[0])) {
        sheet.appendRow(newRow);
    } else {
        const data = sheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            if (data[i][keyCol] == keyVal) {
                sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
                break;
            }
        }
    }
}
`;


  const handleDeepAnalysis = async (overrideEmployeeId?: string, fiscalYear?: number) => {
    const targetId = overrideEmployeeId || selectedEmployeeId;
    if (!targetId) return alert("社員を選択してください。");
    if (overrideEmployeeId) setSelectedEmployeeId(overrideEmployeeId);
    const emp = employees.find(e => e.id === targetId);
    const empResults = results.filter(r => r.employeeId === targetId);
    if (empResults.length === 0) return alert("受講データがありません。");

    const usedFiscalYear = fiscalYear ?? analysisFiscalYear;

    setIsAnalyzing(true);
    try {
      const res = await analyzeHRCompetency(emp?.name || "", empResults, customInstruction);
      setHrAnalysisResult(res);
      // 深層心理→コンピテンシーモディファイアを抽出
      const psychMods = await extractPsychModsFromAnalysis(res);
      const newRecord: DeepAnalysisRecord = {
        id: Date.now().toString(),
        employeeId: targetId,
        employeeName: emp?.name || "不明",
        date: new Date().toISOString(),
        content: res,
        instructionUsed: customInstruction,
        fiscalYear: usedFiscalYear,
        psychMods,
      };
      await onSaveHRAnalysis(newRecord);
      setSelectedHrAnalysis(newRecord);
      await onDeletePsychApplication(targetId);
      onRefresh();
    } catch (e) {
      alert("エラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 全社員一括深層心理分析
  const handleBulkAnalysis = async () => {
    const targets = employees.filter(emp => results.some(r => r.employeeId === emp.id));
    if (targets.length === 0) return alert("受講データのある社員がいません。");
    if (!window.confirm(`${analysisFiscalYear}期として、受講データのある社員 ${targets.length}名の深層心理分析を実行します。\nすでに${analysisFiscalYear}期の分析がある社員はスキップします。\n\n実行しますか？`)) return;

    setIsBulkAnalyzing(true);
    setBulkProgress({ done: 0, total: targets.length });

    let done = 0;
    for (const emp of targets) {
      // 同一年度の分析が既にある場合はスキップ
      const alreadyDone = hrAnalyses.some(
        a => a.employeeId === emp.id && a.fiscalYear === analysisFiscalYear
      );
      if (alreadyDone) {
        done++;
        setBulkProgress({ done, total: targets.length });
        continue;
      }
      try {
        const empResults = results.filter(r => r.employeeId === emp.id);
        const res = await analyzeHRCompetency(emp.name, empResults, "");
        const psychMods = await extractPsychModsFromAnalysis(res);
        const newRecord: DeepAnalysisRecord = {
          id: Date.now().toString() + emp.id,
          employeeId: emp.id,
          employeeName: emp.name,
          date: new Date().toISOString(),
          content: res,
          fiscalYear: analysisFiscalYear,
          psychMods,
        };
        await onSaveHRAnalysis(newRecord);
      } catch (e) {
        console.error(`${emp.name} の分析に失敗しました:`, e);
      }
      done++;
      setBulkProgress({ done, total: targets.length });
    }

    setIsBulkAnalyzing(false);
    setBulkProgress(null);
    onRefresh();
    alert(`一括分析が完了しました。（${done}名処理）`);
  };

  const handleSaveDeadline = (trainingId: string, deadline1: string, deadline2: string) => {
    const updated = deadlines.filter(d => d.trainingId !== trainingId);
    updated.push({ trainingId, deadline1, deadline2 });
    setDeadlines(updated);
    localStorage.setItem('sb_deadlines', JSON.stringify(updated));
  };

  const handleCheckDeadlines = async () => {
    if (!clliqUrl) {
      alert('Cliq Webhook URLが設定されていません。');
      return;
    }

    const now = new Date();
    const overdueList: string[] = [];

    deadlines.forEach(dl => {
      const training = trainings.find(t => t.id === dl.trainingId);
      if (!training) return;

      const checkDeadline = (deadlineStr: string, label: string) => {
        if (!deadlineStr) return;
        const deadline = new Date(deadlineStr);
        if (now > deadline) {
          employees.forEach(emp => {
            const normalizedEmpId = String(emp.id).trim().toUpperCase();
            const result = results.find(r =>
              r.trainingId === dl.trainingId &&
              String(r.employeeId).trim().toUpperCase() === normalizedEmpId
            );
            if (!isCompleted(result)) {
              overdueList.push(`${emp.name} - ${training.title} (${label})`);
            }
          });
        }
      };

      checkDeadline(dl.deadline1, '1回目締切');
      checkDeadline(dl.deadline2, '2回目締切');
    });

    if (overdueList.length === 0) {
      alert('締切を過ぎた未提出者はいません。');
      return;
    }

    const message = `【未提出者リスト】\n\n${overdueList.join('\n')}\n\n速やかに受講を完了してください。`;

    try {
      await fetch(clliqUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message })
      });
      alert(`Cliqに通知を送信しました。\n未提出者: ${overdueList.length}名`);
    } catch (e) {
      alert('Cliq通知の送信に失敗しました。');
    }
  };

  // Filter and sort results
  const filteredAndSortedResults = React.useMemo(() => {
    let filtered = results.filter(r => {
      const nameMatch = r.employeeName.toLowerCase().includes(searchName.toLowerCase());
      const lectureMatch = !searchLecture || r.trainingId === searchLecture;
      return nameMatch && lectureMatch;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.employeeName.localeCompare(b.employeeName, 'ja');
      } else if (sortBy === 'lecture') {
        return (a.trainingTitle || '').localeCompare(b.trainingTitle || '', 'ja');
      } else {
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      }
    });
  }, [results, searchName, searchLecture, sortBy]);

  const renderDetailModal = (res: TestResult) => {
    const t = trainings.find(tr => tr.id === res.trainingId);
    const questions = t?.patterns.find(p => p.id === t.activePatternId)?.questions || [];

    // Ensure userAnswers is an array
    const userAnswersArray = Array.isArray(res.userAnswers) ? res.userAnswers : [];

    console.log('========== MODAL DEBUG ==========');
    console.log('Employee:', res.employeeName);
    console.log('Training:', res.trainingTitle);
    console.log('res.userAnswers:', res.userAnswers);
    console.log('typeof res.userAnswers:', typeof res.userAnswers);
    console.log('Array.isArray(res.userAnswers):', Array.isArray(res.userAnswers));
    console.log('userAnswersArray:', userAnswersArray);
    console.log('userAnswersArray.length:', userAnswersArray.length);
    console.log('questions.length:', questions.length);
    if (userAnswersArray.length === 0) {
      console.error('⚠️ WARNING: userAnswersArray is EMPTY!');
    }
    console.log('=================================')

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 md:p-6 animate-fadeIn">
        <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="p-6 md:p-8 border-b bg-slate-50 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-black text-slate-800">{res.employeeName} さんの受講詳細</h3>
              <p className="text-sm font-bold text-indigo-600">{res.trainingTitle}</p>
            </div>
            <button onClick={() => setSelectedResult(null)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-slate-400 font-bold">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl text-center"><p className="text-[10px] font-black text-slate-400 uppercase">事前スコア</p><p className="text-2xl font-black">{res.preScore}</p></div>
              <div className="p-4 bg-indigo-50 rounded-xl text-center"><p className="text-[10px] font-black text-indigo-400 uppercase">事後スコア</p><p className="text-2xl font-black text-indigo-600">{res.postScore === -1 ? '未完' : res.postScore}</p></div>
            </div>

            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center gap-4">
              <h4 className="text-xs font-black text-slate-400 uppercase text-center">AI個別分析内容</h4>
              <p className="text-sm text-slate-700 leading-relaxed italic text-center">"{res.analysis || '分析待ち（以下のボタンで実行可能）'}"</p>
              {!res.analysis && res.postScore !== -1 && (
                <button onClick={() => onRunManualAnalysis(res)} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
                  AI分析を実行・記録
                </button>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-800 border-b pb-2">設問ごとの回答状況</h4>
              {questions.map((q, idx) => {
                const userAns = userAnswersArray[idx];
                const isCorrect = userAns !== undefined && userAns !== -1 && userAns === q.correctAnswer;

                console.log(`Q${idx + 1} Debug:`, {
                  userAns,
                  correctAnswer: q.correctAnswer,
                  isCorrect,
                  optionExists: q.options[userAns] !== undefined
                });

                return (
                  <div key={idx} className={`p-5 rounded-2xl border-2 ${isCorrect ? 'border-emerald-100 bg-emerald-50/10' : 'border-rose-100 bg-rose-50/10'}`}>
                    <p className="text-sm font-bold text-slate-800 mb-2">Q{idx + 1}. {q.question}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-white rounded-lg border">正解: <span className="font-bold text-emerald-600">{q.options[q.correctAnswer]}</span></div>
                      <div className={`p-2 rounded-lg border font-bold ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        回答: {userAns !== undefined && userAns !== -1 ? (
                          <>
                            {q.options[userAns] ? (
                              q.options[userAns]
                            ) : (
                              <span className="italic text-amber-600">選択肢インデックス: {userAns}</span>
                            )}
                          </>
                        ) : (
                          <span className="italic text-slate-400">未回答</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 未受講者セクション（講義を絞り込んだときのみ表示） */}
        {searchLecture && (() => {
          const selectedTraining = trainings.find(t => t.id === searchLecture);
          if (!selectedTraining) return null;
          const nonCompleters = employees.filter(emp => {
            const normalizedEmpId = String(emp.id).trim().toUpperCase();
            const result = results.find(r =>
              r.trainingId === searchLecture &&
              String(r.employeeId).trim().toUpperCase() === normalizedEmpId
            );
            return !isCompleted(result);
          });
          if (nonCompleters.length === 0) return (
            <div className="px-8 py-4 bg-emerald-50 border-t border-emerald-100 flex items-center gap-2">
              <span className="text-emerald-600 font-black text-sm">✅ 全員受講済み</span>
            </div>
          );
          return (
            <div className="px-8 py-5 bg-rose-50 border-t border-rose-100">
              <p className="text-[10px] font-black text-rose-500 uppercase mb-3">未受講者 ({nonCompleters.length}名)</p>
              <div className="flex flex-wrap gap-2">
                {nonCompleters.map(emp => (
                  <span key={emp.id} className="text-xs font-bold bg-rose-100 text-rose-800 px-3 py-1 rounded-full border border-rose-200">
                    {emp.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {selectedResult && renderDetailModal(selectedResult)}

      <div className="bg-white p-8 rounded-[3rem] border shadow-sm flex flex-col xl:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black text-slate-800">HR Analytics Panel</h2>
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
          >
            🔄 更新
          </button>
        </div>
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-0.5">
          <button onClick={() => setViewMode('growth')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${viewMode === 'growth' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>受講進捗</button>
          <button onClick={() => setViewMode('individual')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${viewMode === 'individual' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'}`}>HR個別管理</button>
          <button onClick={() => setViewMode('hr_mgmt')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${viewMode === 'hr_mgmt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>深層心理分析</button>
          <button onClick={() => setViewMode('employees')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${viewMode === 'employees' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>社員管理</button>
          <button onClick={() => setViewMode('deadlines')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${viewMode === 'deadlines' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>締切管理</button>
          <button onClick={() => setViewMode('setup')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${viewMode === 'setup' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>システム設定</button>
        </div>
      </div>

      {viewMode === 'individual' && (
        <HRIndividualManager employees={employees} results={results} trainings={trainings} hrAnalyses={hrAnalyses} psychApplications={psychApplications} />
      )}

      {viewMode === 'growth' && (
        <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
          <div className="p-8 border-b bg-slate-50/50 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black">受講・理解度ステータス（行クリックで正誤詳細）</h3>
              <button onClick={onRefresh} className="text-xs font-bold text-indigo-600 px-4 py-2 rounded-xl bg-white border border-indigo-100">データ同期</button>
            </div>

            {/* Search and Sort Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">氏名で検索</label>
                <input
                  type="text"
                  placeholder="氏名を入力..."
                  className="w-full px-4 py-2 rounded-lg border-2 text-sm font-bold"
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">講義名で絞り込み</label>
                <select
                  className="w-full px-4 py-2 rounded-lg border-2 text-sm font-bold bg-white"
                  value={searchLecture}
                  onChange={e => setSearchLecture(e.target.value)}
                >
                  <option value="">すべての講義</option>
                  {trainings.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">並び替え</label>
                <select
                  className="w-full px-4 py-2 rounded-lg border-2 text-sm font-bold"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                >
                  <option value="date">日付順</option>
                  <option value="name">氏名順</option>
                  <option value="lecture">講義名順</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500 font-bold">
              表示中: {filteredAndSortedResults.length}件 / 全{results.length}件
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400">
                <tr>
                  <th className="px-8 py-5">社員名</th>
                  <th className="px-8 py-5">研修タイトル</th>
                  <th className="px-8 py-5 text-center">事前スコア</th>
                  <th className="px-8 py-5 text-center">事後スコア</th>
                  <th className="px-8 py-5 text-right">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedResults.map((r, idx) => (
                  <tr key={idx} onClick={() => setSelectedResult(r)} className="hover:bg-indigo-50/30 transition-colors cursor-pointer group">
                    <td className="px-8 py-6 font-bold text-slate-800">{r.employeeName}</td>
                    <td className="px-8 py-6 font-bold text-indigo-600">{r.trainingTitle}</td>
                    <td className="px-8 py-6 text-center font-black text-slate-400">{r.preScore}</td>
                    <td className="px-8 py-6 text-center font-black text-lg">{r.postScore === -1 ? '未完' : r.postScore}</td>
                    <td className="px-8 py-6 text-right" onClick={(e) => e.stopPropagation()}>
                      {r.analysis ? (
                        <span className="text-[10px] text-slate-400 font-black uppercase bg-slate-100 px-2 py-1 rounded">分析済</span>
                      ) : (
                        r.postScore !== -1 && (
                          <button onClick={() => onRunManualAnalysis(r)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black animate-pulse hover:bg-indigo-700 shadow-lg shadow-indigo-100">
                            AI分析を実行・記録
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'hr_mgmt' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">

            {/* 申込者リスト */}
            {psychApplications.length > 0 && (
              <div className="bg-white p-8 rounded-[2rem] border shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <h3 className="text-lg font-black">深層心理レポート申込者</h3>
                  <span className="bg-violet-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">{psychApplications.filter(app => !hrAnalyses.some(a => a.employeeId === app.employeeId)).length}</span>
                </div>
                <div className="space-y-2">
                  {psychApplications.map(app => {
                    const alreadyDone = hrAnalyses.some(a => a.employeeId === app.employeeId);
                    if (alreadyDone) return null;
                    const hasData = results.some(r => r.employeeId === app.employeeId);
                    return (
                      <button
                        key={app.employeeId}
                        onClick={() => handleDeepAnalysis(app.employeeId, analysisFiscalYear)}
                        disabled={isAnalyzing || !hasData}
                        className="w-full text-left p-4 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl border border-violet-100 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-black text-violet-800 text-sm group-hover:text-violet-900">{app.employeeName}</p>
                            <p className="text-[10px] text-violet-400 font-bold mt-0.5">
                              {new Date(app.appliedAt).toLocaleDateString('ja-JP')} 申し込み
                            </p>
                          </div>
                          <span className="text-[10px] font-black text-violet-500 bg-violet-100 px-2 py-1 rounded-lg group-hover:bg-violet-200 transition-colors">
                            {!hasData ? 'データ不足' : isAnalyzing ? '解析中...' : '▶ 分析開始'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-white p-8 rounded-[2rem] border shadow-sm space-y-6">
              {/* 年度設定 */}
              <div>
                <h3 className="text-xl font-black mb-4">深層心理分析設定</h3>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析対象年度</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={analysisFiscalYear}
                      onChange={e => setAnalysisFiscalYear(parseInt(e.target.value) || 48)}
                      className="flex-1 p-3 rounded-xl border-2 font-black text-lg text-center focus:border-indigo-400 focus:outline-none"
                    />
                    <span className="font-black text-slate-500 text-lg">期</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">分析を実行する前に年度を設定してください</p>
                </div>
              </div>

              {/* 全員一括分析ボタン */}
              <div className="p-5 bg-violet-50 border-2 border-violet-100 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧠</span>
                  <h4 className="font-black text-violet-800">全社員一括深層心理分析</h4>
                </div>
                <p className="text-[10px] font-bold text-violet-500">受講データのある全社員を{analysisFiscalYear}期として分析します。既に{analysisFiscalYear}期の分析済みはスキップされます。</p>
                {isBulkAnalyzing && bulkProgress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-black text-violet-700">
                      <span>分析中...</span>
                      <span>{bulkProgress.done} / {bulkProgress.total}</span>
                    </div>
                    <div className="w-full bg-violet-100 rounded-full h-2">
                      <div
                        className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={handleBulkAnalysis}
                  disabled={isBulkAnalyzing || isAnalyzing}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black shadow-lg shadow-violet-100 disabled:bg-slate-200 disabled:text-slate-400 transition-all text-sm"
                >
                  {isBulkAnalyzing ? `解析中 (${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0})...` : `🚀 ${analysisFiscalYear}期 全員を一括分析`}
                </button>
              </div>

              {/* 個人分析 */}
              <div className="pt-2 border-t border-slate-100 space-y-4">
                <h4 className="font-black text-slate-700">個人深層分析</h4>
                <select className="w-full p-4 rounded-xl border-2 font-bold" value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)}>
                  <option value="">社員を選択</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <textarea className="w-full p-4 rounded-xl border-2 h-28 text-sm" placeholder="特定のアドバイスや指示を入力..." value={customInstruction} onChange={e => setCustomInstruction(e.target.value)} />
                <button onClick={() => handleDeepAnalysis()} disabled={isAnalyzing || isBulkAnalyzing || !selectedEmployeeId} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg disabled:bg-slate-200 transition-all">
                  {isAnalyzing ? "解析中..." : `${analysisFiscalYear}期として論理的解明分析を開始`}
                </button>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* ── 過去の分析一覧 ── */}
            <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
              <div className="px-8 py-5 border-b bg-slate-50/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-black text-slate-800">深層心理分析 履歴</h3>
                  {hrAnalyses.length > 0 && (
                    <span className="bg-violet-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">
                      {hrAnalyses.length}件
                    </span>
                  )}
                  {/* 凡例 */}
                  <div className="flex items-center gap-3 ml-2">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> 分析完了
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> リクエスト済
                    </span>
                  </div>
                </div>
                {selectedHrAnalysis && (
                  <button
                    onClick={() => setSelectedHrAnalysis(null)}
                    className="text-[10px] font-black text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    選択解除
                  </button>
                )}
              </div>

              {/* 全社員のステータス一覧（申請済・分析済） */}
              {(() => {
                // 分析済み + 申請済み（未分析）をまとめてリスト化
                const analyzedIds = new Set(hrAnalyses.map(a => a.employeeId));
                const pendingApps = psychApplications.filter(app => !analyzedIds.has(app.employeeId));

                // プライバシー: HR権限は全員表示、それ以外は自分のみ
                const isHRView = isHRRole !== false;
                const visibleAnalyses = isHRView
                  ? hrAnalyses
                  : hrAnalyses.filter(a => a.employeeId === currentEmployeeId);

                const totalVisible = visibleAnalyses.length + (isHRView ? pendingApps.length : 0);
                if (totalVisible === 0) return (
                  <div className="p-10 text-center">
                    <p className="text-slate-300 text-3xl mb-3">📂</p>
                    <p className="text-slate-400 font-bold text-sm">まだ分析結果がありません</p>
                    <p className="text-slate-300 font-bold text-xs mt-1">左パネルで分析を実行すると履歴が表示されます</p>
                  </div>
                );

                return (
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {/* 申請済み（未分析）— オレンジ — HRビューのみ表示 */}
                    {isHRView && pendingApps.map(app => (
                      <div key={`pending-${app.employeeId}`}
                        className="w-full text-left px-8 py-4 flex items-center gap-4 bg-orange-50/40 border-l-4 border-orange-300">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-3 h-3 rounded-full bg-orange-400 shrink-0" />
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm bg-orange-100 text-orange-600`}>
                            {app.employeeName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-sm text-orange-700 truncate">{app.employeeName}</p>
                            <p className="text-[10px] font-bold text-orange-400 mt-0.5">
                              {new Date(app.appliedAt).toLocaleDateString('ja-JP')} リクエスト
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black px-3 py-1 rounded-lg bg-orange-100 text-orange-600 shrink-0">未分析</span>
                      </div>
                    ))}
                    {/* 分析完了 — 青 */}
                    {[...visibleAnalyses]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(record => {
                        const isSelected = selectedHrAnalysis?.id === record.id;
                        // プライバシー制御: リクエストなしの一括分析は本人のみ閲覧可
                        const hasApplied = psychApplications.some(app => app.employeeId === record.employeeId);
                        const isOwn = record.employeeId === currentEmployeeId;
                        // HR権限は全員OK, 本人かつ申請済みもOK
                        const canView = isHRView || isOwn;
                        if (!canView) return null;
                        return (
                          <button
                            key={record.id}
                            onClick={() => setSelectedHrAnalysis(isSelected ? null : record)}
                            className={`w-full text-left px-8 py-5 hover:bg-violet-50 transition-colors flex items-center justify-between gap-4 ${isSelected ? 'bg-violet-50 border-l-4 border-violet-500' : 'border-l-4 border-transparent'}`}
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${isSelected ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {record.employeeName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className={`font-black text-sm truncate ${isSelected ? 'text-violet-700' : 'text-slate-800'}`}>
                                  {record.employeeName}
                                  {record.fiscalYear && (
                                    <span className="ml-2 text-[10px] font-black bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-md">{record.fiscalYear}期</span>
                                  )}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                  {new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  {record.instructionUsed && (
                                    <span className="ml-2 text-violet-400">カスタム指示あり</span>
                                  )}
                                  {record.psychMods && Object.keys(record.psychMods).length > 0 && (
                                    <span className="ml-2 text-emerald-500">コンピテンシー連動済</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-black px-3 py-1 rounded-lg shrink-0 ${isSelected ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {isSelected ? '表示中' : '詳細を見る'}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                );
              })()}
            </div>

            {/* ── 選択中レポート全文 ── */}
            <div className="bg-white rounded-[2rem] border shadow-sm p-10 min-h-[320px] flex flex-col">
              {selectedHrAnalysis ? (
                <>
                  <div className="flex items-start justify-between mb-6 border-b pb-5">
                    <div>
                      <h3 className="text-xl font-black text-slate-800">{selectedHrAnalysis.employeeName} さんの深層心理レポート</h3>
                      <p className="text-xs font-bold text-slate-400 mt-1">
                        {new Date(selectedHrAnalysis.date).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 分析
                      </p>
                      {selectedHrAnalysis.instructionUsed && (
                        <p className="text-xs font-bold text-violet-500 mt-1">
                          指示: {selectedHrAnalysis.instructionUsed}
                        </p>
                      )}
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center text-xl font-black text-violet-600 shrink-0">
                      {selectedHrAnalysis.employeeName.charAt(0)}
                    </div>
                  </div>
                  <div className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-wrap flex-1 text-slate-700">
                    {selectedHrAnalysis.content}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center">
                  <p className="text-4xl mb-4">☝️</p>
                  <p className="text-slate-500 font-black">上のリストから対象者をクリックしてください</p>
                  <p className="text-slate-300 font-bold text-xs mt-2">分析レポートの全文が表示されます</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'employees' && (
        <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
          <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-lg font-black">社員管理</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400">
                <tr>
                  <th className="px-8 py-5">状態</th>
                  <th className="px-8 py-5">氏名 (ID)</th>
                  <th className="px-8 py-5 text-center">完了数</th>
                  <th className="px-8 py-5">権限</th>
                  <th className="px-8 py-5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e, idx) => {
                  // Normalize IDs for comparison
                  const normalizedEmpId = String(e.id).trim().toUpperCase();
                  const completedCount = results.filter(r => {
                    const normalizedResultEmpId = String(r.employeeId).trim().toUpperCase();
                    return normalizedResultEmpId === normalizedEmpId && isCompleted(r);
                  }).length;
                  const totalCount = trainings.length;
                  const lastActive = e.lastActive ? new Date(e.lastActive).getTime() : 0;
                  const isOnline = (Date.now() - lastActive) < 5 * 60 * 1000; // 5 min

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-200'}`}></div>
                          <span className={`text-[10px] font-black uppercase tracking-widest ${isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="font-bold text-slate-800">{e.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{e.id}</div>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full">
                          <span className="text-xs font-black text-indigo-600">{completedCount}</span>
                          <span className="text-[8px] font-black text-slate-400">/ {totalCount}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <select value={e.role} onChange={(ev) => onUpdateEmployeeRole(e.id, ev.target.value as Role)} className="px-3 py-1.5 rounded-lg text-[10px] font-black border bg-white">
                          <option value={Role.TRAINEE}>受講者</option>
                          <option value={Role.TRAINER}>講師</option>
                          <option value={Role.HR}>HR</option>
                        </select>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button onClick={() => onImpersonate(e.id)} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black hover:bg-indigo-600 transition-all shadow-sm">
                          受講者画面を表示
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'deadlines' && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
            <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black">締切管理</h3>
                <p className="text-xs text-slate-500 font-bold mt-1">各講義の1回目・2回目の締切日を設定し、未提出者をCliqに通知</p>
              </div>
              <button onClick={handleCheckDeadlines} className="px-6 py-3 bg-rose-600 text-white rounded-xl font-black text-sm hover:bg-rose-700 shadow-lg">
                📢 未提出者をCliqに通知
              </button>
            </div>
            <div className="p-8 space-y-4">
              {trainings.map(training => {
                const dl = deadlines.find(d => d.trainingId === training.id) || { trainingId: training.id, deadline1: '', deadline2: '' };
                return (
                  <div key={training.id} className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 space-y-4">
                    <h4 className="font-black text-slate-800">{training.title}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">1回目締切日</label>
                        <input
                          type="datetime-local"
                          className="w-full px-4 py-3 rounded-xl border-2 font-bold"
                          value={dl.deadline1}
                          onChange={e => handleSaveDeadline(training.id, e.target.value, dl.deadline2)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">2回目締切日</label>
                        <input
                          type="datetime-local"
                          className="w-full px-4 py-3 rounded-xl border-2 font-bold"
                          value={dl.deadline2}
                          onChange={e => handleSaveDeadline(training.id, dl.deadline1, e.target.value)}
                        />
                      </div>
                    </div>
                    {/* Show overdue employees */}
                    <div className="pt-4 border-t">
                      <p className="text-xs font-black text-slate-400 uppercase mb-2">未提出者</p>
                      <div className="flex flex-wrap gap-2">
                        {employees.filter(emp => {
                          const normalizedEmpId = String(emp.id).trim().toUpperCase();
                          const result = results.find(r =>
                            r.trainingId === training.id &&
                            String(r.employeeId).trim().toUpperCase() === normalizedEmpId
                          );
                          return !isCompleted(result);
                        }).map(emp => (
                          <span key={emp.id} className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
                            {emp.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'setup' && (
        <div className="bg-white p-8 md:p-12 rounded-[2rem] border shadow-sm space-y-8 animate-fadeIn">
          <div className="space-y-4">
            <h3 className="text-xl font-black">GAS同期設定</h3>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Web App URL</label>
              <input type="text" className="w-full p-4 rounded-xl border-2 font-mono text-sm" value={localUrl} onChange={e => setLocalUrl(e.target.value)} />
            </div>
            <button onClick={() => onUpdateGasUrl(localUrl)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-sm">URLを更新</button>
          </div>

          <div className="space-y-4 border-t pt-8">
            <h3 className="text-xl font-black">通知設定 (Clliq)</h3>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Webhook URL</label>
              <input type="text" className="w-full p-4 rounded-xl border-2 font-mono text-sm" value={localClliqUrl} onChange={e => setLocalClliqUrl(e.target.value)} />
            </div>
            <button onClick={() => onUpdateClliqUrl(localClliqUrl)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-sm">通知URLを更新</button>
          </div>

          <div className="space-y-4 border-t pt-8">
            <h3 className="text-xl font-black">AI API Key 設定</h3>
            <p className="text-[10px] text-slate-400 font-bold">Gemini APIを使用するためのキーを設定します。</p>
            <button onClick={onOpenSelectKey} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700">
              APIキーを選択・入力
            </button>
          </div>

          <div className="space-y-4 border-t pt-8">
            <h3 className="text-xl font-black">データバックアップ・復元</h3>
            <p className="text-[10px] text-slate-400 font-bold">すべてのデータ（社員情報、研修、テスト結果、HR分析）をバックアップまたは復元します。</p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  const backupData = {
                    version: "1.0",
                    timestamp: new Date().toISOString(),
                    data: {
                      employees,
                      trainings,
                      results,
                      hrAnalyses,
                      wrongAnswerAnalyses,
                      annualSummaries: annualSummaries || []
                    }
                  };
                  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `hr-analytics-backup-${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  alert('バックアップファイルをダウンロードしました。');
                }}
                className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700"
              >
                📥 バックアップをダウンロード
              </button>
              <button
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const backupData = JSON.parse(text);

                      if (!backupData.version || !backupData.data) {
                        alert('無効なバックアップファイルです。');
                        return;
                      }

                      if (!confirm('現在のデータを復元したデータで上書きします。よろしいですか？\n\n注意: この操作は元に戻せません。')) {
                        return;
                      }

                      // Restore data to localStorage
                      if (backupData.data.employees) {
                        localStorage.setItem('sb_employees', JSON.stringify(backupData.data.employees));
                      }
                      if (backupData.data.trainings) {
                        localStorage.setItem('sb_trainings', JSON.stringify(backupData.data.trainings));
                      }
                      if (backupData.data.results) {
                        localStorage.setItem('sb_results', JSON.stringify(backupData.data.results));
                      }
                      if (backupData.data.hrAnalyses) {
                        localStorage.setItem('sb_hr_analyses', JSON.stringify(backupData.data.hrAnalyses));
                      }
                      if (backupData.data.wrongAnswerAnalyses) {
                        localStorage.setItem('sb_wrong_answer_analyses', JSON.stringify(backupData.data.wrongAnswerAnalyses));
                      }

                      alert('データを復元しました。ページをリロードして変更を適用します。');
                      window.location.reload();
                    } catch (e) {
                      alert('バックアップファイルの読み込みに失敗しました。ファイル形式を確認してください。');
                    }
                  };
                  input.click();
                }}
                className="px-8 py-3 bg-amber-600 text-white rounded-xl font-black text-sm shadow-lg shadow-amber-100 transition-all hover:bg-amber-700"
              >
                📤 バックアップから復元
              </button>
            </div>
            <p className="text-[10px] text-rose-500 font-bold">⚠️ バックアップファイルにはパスワードとOTPシークレットが含まれます。安全に保管してください。</p>
          </div>

          <div className="space-y-4 border-t pt-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black">GAS ソースコード</h3>
              <button
                onClick={() => { navigator.clipboard.writeText(gasSourceCode); alert("コピーしました。GASエディタに貼り付けてください。"); }}
                className="text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg"
              >
                コードをコピー
              </button>
            </div>
            <div className="bg-slate-900 rounded-2xl p-6 overflow-x-auto">
              <pre className="text-indigo-300 text-[10px] md:text-xs font-mono leading-relaxed">
                {gasSourceCode}
              </pre>
            </div>
            <p className="text-[10px] text-slate-400 font-bold">※セキュリティのため一部省略しています。完全なコードはバックエンド管理から参照してください。</p>
          </div>
        </div>
      )}
    </div>
  );
};
