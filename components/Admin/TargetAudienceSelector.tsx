import React, { useMemo } from 'react';
import { Employee } from '../../types';

interface TargetAudienceSelectorProps {
    employees: Employee[];
    targetEmployees: string[];
    targetDepartments: string[];
    targetPositions: string[];
    onTargetEmployeesChange: (ids: string[]) => void;
    onTargetDepartmentsChange: (depts: string[]) => void;
    onTargetPositionsChange: (positions: string[]) => void;
}

export const TargetAudienceSelector: React.FC<TargetAudienceSelectorProps> = ({
    employees,
    targetEmployees,
    targetDepartments,
    targetPositions,
    onTargetEmployeesChange,
    onTargetDepartmentsChange,
    onTargetPositionsChange
}) => {
    const uniqueDepartments = useMemo(() => {
        const depts = employees.map(e => e.department).filter(Boolean) as string[];
        return Array.from(new Set(depts)).sort();
    }, [employees]);

    const uniquePositions = useMemo(() => {
        const positions = employees.map(e => e.position).filter(Boolean) as string[];
        return Array.from(new Set(positions)).sort();
    }, [employees]);

    const toggleEmployee = (empId: string) => {
        if (targetEmployees.includes(empId)) {
            onTargetEmployeesChange(targetEmployees.filter(id => id !== empId));
        } else {
            onTargetEmployeesChange([...targetEmployees, empId]);
        }
    };

    const toggleDepartment = (dept: string) => {
        if (targetDepartments.includes(dept)) {
            onTargetDepartmentsChange(targetDepartments.filter(d => d !== dept));
        } else {
            onTargetDepartmentsChange([...targetDepartments, dept]);
        }
    };

    const togglePosition = (position: string) => {
        if (targetPositions.includes(position)) {
            onTargetPositionsChange(targetPositions.filter(p => p !== position));
        } else {
            onTargetPositionsChange([...targetPositions, position]);
        }
    };

    const selectAllEmployees = () => {
        onTargetEmployeesChange(employees.map(e => e.id));
    };

    const clearAllEmployees = () => {
        onTargetEmployeesChange([]);
    };

    const selectAllDepartments = () => {
        onTargetDepartmentsChange(uniqueDepartments);
    };

    const clearAllDepartments = () => {
        onTargetDepartmentsChange([]);
    };

    const selectAllPositions = () => {
        onTargetPositionsChange(uniquePositions);
    };

    const clearAllPositions = () => {
        onTargetPositionsChange([]);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">📋 対象者設定</h3>
                <span className="text-xs text-slate-500">
                    未設定の場合は全員に表示されます
                </span>
            </div>

            {/* 個別社員選択 */}
            <div className="bg-slate-50 p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-bold text-slate-700">個別選択</label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={selectAllEmployees}
                            className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg font-bold hover:bg-indigo-200"
                        >
                            全選択
                        </button>
                        <button
                            type="button"
                            onClick={clearAllEmployees}
                            className="text-xs px-3 py-1 bg-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-300"
                        >
                            クリア
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {employees.map(emp => (
                        <button
                            key={emp.id}
                            type="button"
                            onClick={() => toggleEmployee(emp.id)}
                            className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${targetEmployees.includes(emp.id)
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
                                }`}
                        >
                            {emp.name}
                            {emp.department && <span className="ml-1 text-[10px] opacity-70">({emp.department})</span>}
                        </button>
                    ))}
                </div>
                {targetEmployees.length > 0 && (
                    <div className="mt-2 text-xs text-slate-600">
                        選択中: {targetEmployees.length}名
                    </div>
                )}
            </div>

            {/* 部署選択 */}
            {uniqueDepartments.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-bold text-slate-700">部署で選択</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={selectAllDepartments}
                                className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-bold hover:bg-blue-200"
                            >
                                全選択
                            </button>
                            <button
                                type="button"
                                onClick={clearAllDepartments}
                                className="text-xs px-3 py-1 bg-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-300"
                            >
                                クリア
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {uniqueDepartments.map(dept => (
                            <button
                                key={dept}
                                type="button"
                                onClick={() => toggleDepartment(dept)}
                                className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${targetDepartments.includes(dept)
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
                                    }`}
                            >
                                {dept}
                                <span className="ml-1 text-[10px] opacity-70">
                                    ({employees.filter(e => e.department === dept).length}名)
                                </span>
                            </button>
                        ))}
                    </div>
                    {targetDepartments.length > 0 && (
                        <div className="mt-2 text-xs text-slate-600">
                            選択中: {targetDepartments.join(', ')}
                        </div>
                    )}
                </div>
            )}

            {/* 役職選択 */}
            {uniquePositions.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-bold text-slate-700">役職で選択</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={selectAllPositions}
                                className="text-xs px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold hover:bg-emerald-200"
                            >
                                全選択
                            </button>
                            <button
                                type="button"
                                onClick={clearAllPositions}
                                className="text-xs px-3 py-1 bg-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-300"
                            >
                                クリア
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {uniquePositions.map(position => (
                            <button
                                key={position}
                                type="button"
                                onClick={() => togglePosition(position)}
                                className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${targetPositions.includes(position)
                                    ? 'bg-emerald-600 text-white shadow-md'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
                                    }`}
                            >
                                {position}
                                <span className="ml-1 text-[10px] opacity-70">
                                    ({employees.filter(e => e.position === position).length}名)
                                </span>
                            </button>
                        ))}
                    </div>
                    {targetPositions.length > 0 && (
                        <div className="mt-2 text-xs text-slate-600">
                            選択中: {targetPositions.join(', ')}
                        </div>
                    )}
                </div>
            )}

            {/* サマリー */}
            {(targetEmployees.length > 0 || targetDepartments.length > 0 || targetPositions.length > 0) && (
                <div className="bg-indigo-50 p-4 rounded-xl border-2 border-indigo-200">
                    <div className="text-sm font-bold text-indigo-800 mb-2">📊 対象者サマリー</div>
                    <div className="text-xs text-indigo-700 space-y-1">
                        {targetEmployees.length > 0 && <div>• 個別指定: {targetEmployees.length}名</div>}
                        {targetDepartments.length > 0 && <div>• 部署指定: {targetDepartments.join(', ')}</div>}
                        {targetPositions.length > 0 && <div>• 役職指定: {targetPositions.join(', ')}</div>}
                    </div>
                </div>
            )}
        </div>
    );
};
