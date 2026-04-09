import React, { useState, useRef } from 'react';
import { Employee, Role, Training, TestResult } from '../../types';

interface EmployeeManagerProps {
    employees: Employee[];
    trainings: Training[];
    results: TestResult[];
    onAddEmployee: (employee: Employee) => void;
    onUpdateEmployee: (employee: Employee) => void;
    onDeleteEmployee: (employeeId: string) => void;
    gasUrl?: string;
}

// preScore・postScore が両方有効な数値なら受講済み
const isCompleted = (result: TestResult | undefined): boolean => {
    if (!result) return false;
    const { preScore, postScore } = result;
    return typeof preScore === 'number' && preScore !== -1 &&
        typeof postScore === 'number' && postScore !== -1;
};

export const EmployeeManager: React.FC<EmployeeManagerProps> = ({
    employees,
    trainings,
    results,
    onAddEmployee,
    onUpdateEmployee,
    onDeleteEmployee,
    gasUrl
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [selectedFiscalYear, setSelectedFiscalYear] = useState<number>(() => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        return month >= 4 ? year : year - 1;
    });
    const [isYearlyView, setIsYearlyView] = useState(true);
    const restoreInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        role: Role.TRAINEE as Role,
        password: '',
        department: '',
        position: '',
        requiredTrainings: [] as string[],
        challengeTrainings: [] as string[]
    });

    const resetForm = () => {
        setFormData({
            id: '',
            name: '',
            role: Role.TRAINEE,
            password: '',
            department: '',
            position: '',
            requiredTrainings: [],
            challengeTrainings: []
        });
        setIsCreating(false);
        setEditingEmployee(null);
    };

    const handleEdit = (employee: Employee) => {
        setEditingEmployee(employee);
        setFormData({
            id: employee.id,
            name: employee.name,
            role: employee.role,
            password: '',
            department: employee.department || '',
            position: employee.position || '',
            requiredTrainings: employee.requiredTrainings || [],
            challengeTrainings: employee.challengeTrainings || []
        });
        setIsCreating(true);
    };

    const handleSubmit = () => {
        if (!formData.id.trim() || !formData.name.trim()) {
            alert('IDと名前は必須です');
            return;
        }

        const employeeData: Employee = {
            id: formData.id.trim(),
            name: formData.name.trim(),
            role: formData.role,
            password: formData.password || undefined,
            department: formData.department.trim() || undefined,
            position: formData.position.trim() || undefined,
            requiredTrainings: formData.requiredTrainings,
            challengeTrainings: formData.challengeTrainings
        };

        if (editingEmployee) {
            onUpdateEmployee(employeeData);
        } else {
            onAddEmployee(employeeData);
        }
        resetForm();
    };

    const handleDelete = (employeeId: string) => {
        if (confirm('本当にこの社員を削除しますか？')) {
            onDeleteEmployee(employeeId);
        }
    };

    const toggleTrainingAssignment = (trainingId: string, type: 'required' | 'challenge') => {
        if (type === 'required') {
            const isCurrentlyRequired = formData.requiredTrainings.includes(trainingId);
            if (isCurrentlyRequired) {
                setFormData(prev => ({
                    ...prev,
                    requiredTrainings: prev.requiredTrainings.filter(id => id !== trainingId)
                }));
            } else {
                setFormData(prev => ({
                    ...prev,
                    requiredTrainings: [...prev.requiredTrainings, trainingId],
                    challengeTrainings: prev.challengeTrainings.filter(id => id !== trainingId)
                }));
            }
        } else {
            const isCurrentlyChallenge = formData.challengeTrainings.includes(trainingId);
            if (isCurrentlyChallenge) {
                setFormData(prev => ({
                    ...prev,
                    challengeTrainings: prev.challengeTrainings.filter(id => id !== trainingId)
                }));
            } else {
                setFormData(prev => ({
                    ...prev,
                    challengeTrainings: [...prev.challengeTrainings, trainingId],
                    requiredTrainings: prev.requiredTrainings.filter(id => id !== trainingId)
                }));
            }
        }
    };

    const getTrainingStatus = (trainingId: string, isGlobal: boolean) => {
        if (isGlobal) return 'global_required';
        if (formData.requiredTrainings.includes(trainingId)) return 'required';
        if (formData.challengeTrainings.includes(trainingId)) return 'challenge';
        return 'hidden';
    };

    // 社員の有効な必須研修（全員必須 OR 個人設定）
    const getEffectiveRequired = (employee: Employee) => {
        const globalRequired = trainings.filter(t => t.isRequiredForAll).map(t => t.id);
        const personalRequired = employee.requiredTrainings || [];
        return [...new Set([...globalRequired, ...personalRequired])];
    };

    // ペナルティ計算
    const getPenalty = (employee: Employee, fy?: number): number => {
        const effectiveRequired = getEffectiveRequired(employee).filter(tId => {
            if (!fy) return true;
            const t = trainings.find(tr => tr.id === tId);
            return (t?.fiscalYear || getCurrentFiscalYear()) === fy;
        });
        const empId = String(employee.id).trim().toUpperCase();
        const incompleteCount = effectiveRequired.filter(tId => {
            const result = results.find(r =>
                String(r.trainingId).trim().toUpperCase() === tId.toUpperCase() &&
                String(r.employeeId).trim().toUpperCase() === empId
            );
            return !isCompleted(result);
        }).length;
        return incompleteCount * -5;
    };

    // 数量UP加点：必須でない講義の受講ボーナス
    const getBonus = (employee: Employee, fy?: number): number => {
        const effectiveRequired = getEffectiveRequired(employee);
        const empId = String(employee.id).trim().toUpperCase();
        let bonus = 0;
        results.forEach(r => {
            if (String(r.employeeId).trim().toUpperCase() !== empId) return;
            // 講義情報を取得
            const training = trainings.find(t => t.id.toUpperCase() === String(r.trainingId).trim().toUpperCase());
            if (!training) return;

            // 年度フィルター
            if (fy && (training.fiscalYear || getCurrentFiscalYear()) !== fy) return;

            // 必須講義は対象外
            if (effectiveRequired.some(tId => tId.toUpperCase() === String(r.trainingId).trim().toUpperCase())) return;
            // 受講完了
            if (!isCompleted(r)) return;

            const score = r.postScore as number;
            const activePattern = training?.patterns?.find(p => p.id === training.activePatternId) || training?.patterns?.[0];
            const totalQuestions = activePattern?.questions?.length || 0;
            if (totalQuestions === 0) return;
            const percentage = (score / totalQuestions) * 100;
            if (percentage >= 90) bonus += 5;
            else if (percentage >= 80) bonus += 3;
        });
        return bonus;
    };

    const getCurrentFiscalYear = () => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        return month >= 4 ? year : year - 1;
    };

    const getTermFromFiscalYear = (fy: number) => fy - 1976;

    const currentFY = getCurrentFiscalYear();

    const BACKUP_KEYS = [
        'sb_employees', 'sb_trainings', 'sb_training_flags', 'sb_results',
        'sb_wrong_answer_analyses', 'sb_announcements', 'sb_gas_url', 'sb_clliq_url', 'sb_manual_api_key'
    ];

    const handleBackup = () => {
        const backup: Record<string, any> = { _version: 1, _exportedAt: new Date().toISOString() };
        BACKUP_KEYS.forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) {
                try { backup[key] = JSON.parse(val); } catch { backup[key] = val; }
            }
        });
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        link.href = URL.createObjectURL(blob);
        link.download = `バックアップ_${dateStr}.json`;
        link.click();
    };

    const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string);
                if (!data || typeof data !== 'object') throw new Error('不正なファイル');
                const restoredKeys: string[] = [];
                BACKUP_KEYS.forEach(key => {
                    if (key in data) {
                        localStorage.setItem(key, JSON.stringify(data[key]));
                        restoredKeys.push(key);
                    }
                });
                alert(`復元完了（${restoredKeys.length}件）。ページをリロードします。`);
                window.location.reload();
            } catch {
                alert('復元に失敗しました。バックアップファイルを確認してください。');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleDownloadEmployeeList = () => {
        const headers = ['ID', '氏名', '役割', '部署', '役職'];
        const csvRows = [headers.join(',')];

        employees.forEach(emp => {
            const roleLabel = emp.role === Role.TRAINER ? '講義作成' : emp.role === Role.HR ? 'HR分析' : '受講者';
            const row = [emp.id, emp.name, roleLabel, emp.department || '', emp.position || ''];
            csvRows.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        link.href = URL.createObjectURL(blob);
        link.download = `社員一覧_${dateStr}.csv`;
        link.click();
    };

    const handleDownload = () => {
        const termLabel = isYearlyView ? `${getTermFromFiscalYear(selectedFiscalYear)}年度` : '通算';
        const headers = ['ID', '氏名', '必須(完了/全)', '任意完了', '評価マイナス', '数量UP加点', '年度'];
        const csvRows = [headers.join(',')];

        employees.forEach(emp => {
            const fy = isYearlyView ? selectedFiscalYear : undefined;
            const effectiveRequired = getEffectiveRequired(emp).filter(tId => {
                if (!fy) return true;
                const t = trainings.find(tr => tr.id === tId);
                return (t?.fiscalYear || currentFY) === fy;
            });
            const empId = String(emp.id).trim().toUpperCase();
            const completedRequired = effectiveRequired.filter(tId => {
                const result = results.find(r =>
                    String(r.trainingId).trim().toUpperCase() === tId.toUpperCase() &&
                    String(r.employeeId).trim().toUpperCase() === empId
                );
                return isCompleted(result);
            }).length;

            const optionalDone = results.filter(r => {
                if (String(r.employeeId).trim().toUpperCase() !== empId) return false;
                if (!isCompleted(r)) return false;
                const isReq = getEffectiveRequired(emp).some(tId => tId.toUpperCase() === String(r.trainingId).trim().toUpperCase());
                if (isReq) return false;
                if (fy) {
                    const t = trainings.find(tr => tr.id === r.trainingId);
                    return (t?.fiscalYear || currentFY) === fy;
                }
                return true;
            }).length;

            const penalty = getPenalty(emp, fy);
            const bonus = getBonus(emp, fy);

            const row = [
                emp.id,
                emp.name,
                `${completedRequired}/${effectiveRequired.length}`,
                optionalDone,
                penalty,
                bonus,
                termLabel
            ];
            csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        link.href = URL.createObjectURL(blob);
        link.download = `Skill点数_${dateStr}.csv`;
        link.click();

        // 蓄積用データを保存 (GASに送る)
        employees.forEach(emp => {
            const fy = isYearlyView ? selectedFiscalYear : currentFY;
            const effectiveRequired = getEffectiveRequired(emp).filter(tId => {
                const t = trainings.find(tr => tr.id === tId);
                return (t?.fiscalYear || currentFY) === fy;
            });
            const empId = String(emp.id).trim().toUpperCase();
            const completedRequired = effectiveRequired.filter(tId => {
                const result = results.find(r =>
                    String(r.trainingId).trim().toUpperCase() === tId.toUpperCase() &&
                    String(r.employeeId).trim().toUpperCase() === empId
                );
                return isCompleted(result);
            }).length;

            const optionalDone = results.filter(r => {
                if (String(r.employeeId).trim().toUpperCase() !== empId) return false;
                if (!isCompleted(r)) return false;
                const isReq = getEffectiveRequired(emp).some(tId => tId.toUpperCase() === String(r.trainingId).trim().toUpperCase());
                if (isReq) return false;
                const t = trainings.find(tr => tr.id === r.trainingId);
                return (t?.fiscalYear || currentFY) === fy;
            }).length;

            const penalty = getPenalty(emp, fy);
            const bonus = getBonus(emp, fy);

            // 深層心理分析（traits/competenciesの履歴を統合）
            const empResults = results.filter(r => String(r.employeeId).trim().toUpperCase() === empId && isCompleted(r));
            const allTraits = [...new Set(empResults.flatMap(r => r.traits || []))].join(' / ');

            const summary = {
                id: emp.id,
                name: emp.name,
                requiredTotal: effectiveRequired.length,
                requiredDone: completedRequired,
                optionalDone: optionalDone,
                penalty: penalty,
                bonus: bonus,
                fiscalYear: fy,
                psychologyAnalysis: allTraits
            };

            // GAS API call via fetch
            if (gasUrl) {
                fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ type: 'SAVE_ANNUAL_SUMMARY', summary })
                }).then(() => console.log('Saved annual summary for', emp.name))
                    .catch(err => console.error('GAS sync error:', err));
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* データ管理 */}
            <div className="flex items-center gap-3 p-4 bg-slate-800 rounded-2xl border border-slate-700">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">データ管理</span>
                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={handleBackup}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1"
                    >
                        💾 バックアップ
                    </button>
                    <button
                        onClick={() => restoreInputRef.current?.click()}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1"
                    >
                        🔄 バックアップから復元
                    </button>
                    <input ref={restoreInputRef} type="file" accept=".json" onChange={handleRestore} className="hidden" />
                </div>
            </div>
            <div className="flex justify-between items-center bg-slate-100 p-2 rounded-2xl border border-slate-200">
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsYearlyView(true)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${isYearlyView ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                        {getTermFromFiscalYear(selectedFiscalYear)}年度分
                    </button>
                    <button
                        onClick={() => setIsYearlyView(false)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${!isYearlyView ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                        通算分
                    </button>
                </div>
                {isYearlyView && (
                    <select
                        value={selectedFiscalYear}
                        onChange={(e) => setSelectedFiscalYear(parseInt(e.target.value))}
                        className="bg-transparent text-xs font-bold text-slate-600 outline-none"
                    >
                        {Array.from({ length: 5 }, (_, i) => currentFY - 2 + i).map(y => (
                            <option key={y} value={y}>{getTermFromFiscalYear(y)}年度</option>
                        ))}
                    </select>
                )}
            </div>

            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800">👥 社員管理</h2>
                <div className="flex gap-3">
                    <button
                        onClick={handleDownloadEmployeeList}
                        className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-2xl transition-all shadow-lg flex items-center gap-2"
                    >
                        📋 社員一覧CSV
                    </button>
                    <button
                        onClick={handleDownload}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-all shadow-lg flex items-center gap-2"
                    >
                        📥 ダウンロード
                    </button>
                    <button
                        onClick={() => setIsCreating(!isCreating)}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg"
                    >
                        {isCreating ? '✕ キャンセル' : '+ 新規追加'}
                    </button>
                </div>
            </div>

            {isCreating && (
                <div className="bg-white p-6 rounded-2xl border-2 border-indigo-200 shadow-lg">
                    <h3 className="text-lg font-black text-slate-800 mb-4">
                        {editingEmployee ? '社員情報編集' : '新しい社員'}
                    </h3>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">社員ID</label>
                                <input
                                    type="text"
                                    value={formData.id}
                                    onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                                    placeholder="001"
                                    disabled={!!editingEmployee}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">名前</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                                    placeholder="山田太郎"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">役割</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as Role }))}
                                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                                >
                                    <option value={Role.TRAINEE}>受講者</option>
                                    <option value={Role.TRAINER}>講義作成</option>
                                    <option value={Role.HR}>HR分析</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    パスワード {editingEmployee && '(変更する場合のみ入力)'}
                                </label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                                    placeholder="6桁の数字"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">部署</label>
                                <input
                                    type="text"
                                    value={formData.department}
                                    onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                                    placeholder="営業部"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">役職</label>
                                <input
                                    type="text"
                                    value={formData.position}
                                    onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                                    placeholder="主任"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-3">講義設定</label>
                            <div className="space-y-2 max-h-64 overflow-y-auto bg-slate-50 p-4 rounded-xl">
                                {trainings.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-4">講義がまだありません</p>
                                ) : (
                                    trainings.map(training => {
                                        const isGlobal = training.isRequiredForAll || false;
                                        const status = getTrainingStatus(training.id, isGlobal);
                                        return (
                                            <div key={training.id} className={`flex items-center justify-between p-3 bg-white rounded-lg border ${isGlobal ? 'border-rose-200 bg-rose-50' : ''}`}>
                                                <div>
                                                    <span className="text-sm font-bold text-slate-700">{training.title}</span>
                                                    {isGlobal && (
                                                        <span className="ml-2 text-[10px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">全員必須</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    {isGlobal ? (
                                                        <span className="px-3 py-1 text-xs font-black text-rose-700 bg-rose-100 border-2 border-rose-400 rounded-lg">🔴 必須（全員）</span>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => toggleTrainingAssignment(training.id, 'required')}
                                                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${status === 'required'
                                                                    ? 'bg-rose-100 text-rose-700 border-2 border-rose-500'
                                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                                    }`}
                                                            >
                                                                必須
                                                            </button>
                                                            <button
                                                                onClick={() => toggleTrainingAssignment(training.id, 'challenge')}
                                                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${status === 'challenge'
                                                                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                                    }`}
                                                            >
                                                                任意
                                                            </button>
                                                            {status !== 'hidden' && (
                                                                <button
                                                                    onClick={() => {
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            requiredTrainings: prev.requiredTrainings.filter(id => id !== training.id),
                                                                            challengeTrainings: prev.challengeTrainings.filter(id => id !== training.id)
                                                                        }));
                                                                    }}
                                                                    className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300"
                                                                >
                                                                    非表示
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition-all"
                        >
                            {editingEmployee ? '更新' : '追加'}
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-600">登録済み社員 ({employees.length}名)</h3>
                {employees.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-bold">社員がまだ登録されていません</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {employees.map(employee => {
                            const penalty = getPenalty(employee, isYearlyView ? selectedFiscalYear : undefined);
                            const bonus = getBonus(employee, isYearlyView ? selectedFiscalYear : undefined);
                            const empId = String(employee.id).trim().toUpperCase();
                            const effectiveRequired = getEffectiveRequired(employee).filter(tId => {
                                if (!isYearlyView) return true;
                                const t = trainings.find(tr => tr.id === tId);
                                return (t?.fiscalYear || currentFY) === selectedFiscalYear;
                            });
                            const completedRequired = effectiveRequired.filter(tId => {
                                const result = results.find(r =>
                                    String(r.trainingId).trim().toUpperCase() === tId.toUpperCase() &&
                                    String(r.employeeId).trim().toUpperCase() === empId
                                );
                                return isCompleted(result);
                            }).length;
                            const incompleteRequired = effectiveRequired.length - completedRequired;

                            return (
                                <div
                                    key={employee.id}
                                    className="p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-indigo-300 transition-all"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="text-sm font-black text-slate-800">{employee.name}</div>
                                            <div className="text-xs text-slate-400">ID: {employee.id}</div>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-bold rounded ${employee.role === Role.TRAINER ? 'bg-indigo-100 text-indigo-700' :
                                            employee.role === Role.HR ? 'bg-rose-100 text-rose-700' :
                                                'bg-slate-100 text-slate-700'
                                            }`}>
                                            {employee.role === Role.TRAINER ? '講義作成' :
                                                employee.role === Role.HR ? 'HR分析' : '受講者'}
                                        </span>
                                    </div>

                                    <div className="text-xs text-slate-500 mb-2">
                                        {employee.department && <div>部署: {employee.department}</div>}
                                        {employee.position && <div>役職: {employee.position}</div>}
                                        <div>必須: {effectiveRequired.length}件（完了: {completedRequired}件）</div>
                                        <div>任意: {
                                            results.filter(r => {
                                                if (String(r.employeeId).trim().toUpperCase() !== empId) return false;
                                                if (!isCompleted(r)) return false;
                                                const isReq = getEffectiveRequired(employee).some(tId => tId.toUpperCase() === String(r.trainingId).trim().toUpperCase());
                                                if (isReq) return false;
                                                if (isYearlyView) {
                                                    const t = trainings.find(tr => tr.id === r.trainingId);
                                                    return (t?.fiscalYear || currentFY) === selectedFiscalYear;
                                                }
                                                return true;
                                            }).length
                                        }件</div>
                                    </div>

                                    {(() => {
                                        const hasScore = penalty !== 0 || bonus !== 0;
                                        const total = penalty + bonus;
                                        if (!hasScore && effectiveRequired.length === 0) return null;
                                        return (
                                            <div className="mb-3 rounded-xl border overflow-hidden">
                                                {penalty !== 0 && (
                                                    <div className="px-3 py-1.5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-rose-500 uppercase">評価マイナス</span>
                                                        <span className="text-xs font-black text-rose-700">{penalty}点</span>
                                                    </div>
                                                )}
                                                {bonus > 0 && (
                                                    <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-emerald-600 uppercase">数量UP加点</span>
                                                        <span className="text-xs font-black text-emerald-700">+{bonus}点</span>
                                                    </div>
                                                )}
                                                {incompleteRequired === 0 && effectiveRequired.length > 0 && penalty === 0 && (
                                                    <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-emerald-600 uppercase">必須完了</span>
                                                        <span className="text-xs font-black text-emerald-700">✓</span>
                                                    </div>
                                                )}
                                                {hasScore && (
                                                    <div className={`px-3 py-1.5 flex items-center justify-between ${total >= 0 ? 'bg-slate-50' : 'bg-rose-100'}`}>
                                                        <span className="text-[10px] font-black text-slate-600 uppercase">合計</span>
                                                        <span className={`text-sm font-black ${total > 0 ? 'text-emerald-700' : total < 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                                                            {total > 0 ? '+' : ''}{total}点
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEdit(employee)}
                                            className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all"
                                        >
                                            編集
                                        </button>
                                        <button
                                            onClick={() => handleDelete(employee.id)}
                                            className="flex-1 px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold rounded-lg transition-all"
                                        >
                                            削除
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
