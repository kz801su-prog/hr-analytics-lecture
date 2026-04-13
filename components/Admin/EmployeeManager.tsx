import React, { useState, useRef } from "react";
import { Employee, Role, Training, TestResult, PositionPermission, EmployeeFieldKey } from "../../types";

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
  return (
    typeof preScore === "number" &&
    preScore !== -1 &&
    typeof postScore === "number" &&
    postScore !== -1
  );
};

export const EmployeeManager: React.FC<EmployeeManagerProps> = ({
  employees,
  trainings,
  results,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  gasUrl,
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
  const csvImportRef = useRef<HTMLInputElement>(null);

  // メインタブ
  const [mainTab, setMainTab] = useState<'list' | 'csv' | 'permissions'>('list');

  // CSV インポート
  const [csvPreview, setCsvPreview] = useState<Partial<Employee>[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  // 役職別権限設定
  const [positionPermissions, setPositionPermissions] = useState<PositionPermission[]>(() => {
    try { return JSON.parse(localStorage.getItem('sb_pos_perms') || '[]'); } catch { return []; }
  });
  const [editingPerm, setEditingPerm] = useState<PositionPermission | null>(null);
  const [newPermPosition, setNewPermPosition] = useState('');

  const ALL_FIELDS: { key: EmployeeFieldKey; label: string; group: string }[] = [
    { key: 'id',             label: '社員ID',       group: '基本' },
    { key: 'name',           label: '氏名',         group: '基本' },
    { key: 'department',     label: '部署',         group: '基本' },
    { key: 'position',       label: '役職',         group: '基本' },
    { key: 'role',           label: 'システム権限', group: '基本' },
    { key: 'employeeNo',     label: '社員番号',     group: '個人情報' },
    { key: 'hireDate',       label: '入社日',       group: '個人情報' },
    { key: 'email',          label: 'メール',       group: '個人情報' },
    { key: 'phone',          label: '電話番号',     group: '個人情報' },
    { key: 'managerId',      label: '上司ID',       group: '個人情報' },
    { key: 'grade',          label: '等級',         group: '個人情報' },
    { key: 'employmentType', label: '雇用形態',     group: '個人情報' },
    { key: 'results',        label: '受講結果',     group: '分析データ' },
    { key: 'competency',     label: 'コンピテンシー', group: '分析データ' },
    { key: 'psychAnalysis',  label: '深層心理分析', group: '分析データ' },
    { key: 'salesData',      label: '売上データ',   group: '分析データ' },
    { key: 'incidents',      label: 'ペナルティ・事案', group: '分析データ' },
  ];

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    role: Role.TRAINEE as Role,
    password: "",
    department: "",
    position: "",
    requiredTrainings: [] as string[],
    challengeTrainings: [] as string[],
    // 拡張フィールド
    employeeNo: "",
    hireDate: "",
    email: "",
    phone: "",
    managerId: "",
    grade: "",
    employmentType: "",
  });

  const EMPTY_FORM = {
    id: "", name: "", role: Role.TRAINEE as Role, password: "",
    department: "", position: "",
    requiredTrainings: [] as string[], challengeTrainings: [] as string[],
    employeeNo: "", hireDate: "", email: "", phone: "",
    managerId: "", grade: "", employmentType: "",
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setIsCreating(false);
    setEditingEmployee(null);
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      password: "",
      department: employee.department || "",
      position: employee.position || "",
      requiredTrainings: employee.requiredTrainings || [],
      challengeTrainings: employee.challengeTrainings || [],
      employeeNo: employee.employeeNo || "",
      hireDate: employee.hireDate || "",
      email: employee.email || "",
      phone: employee.phone || "",
      managerId: employee.managerId || "",
      grade: employee.grade || "",
      employmentType: employee.employmentType || "",
    });
    setIsCreating(true);
  };

  // ── CSV インポート ──────────────────────────────────────────────────────────
  const CSV_HEADERS: { key: keyof Employee; label: string }[] = [
    { key: 'id',             label: 'ID' },
    { key: 'name',           label: '氏名' },
    { key: 'department',     label: '部署' },
    { key: 'position',       label: '役職' },
    { key: 'employeeNo',     label: '社員番号' },
    { key: 'hireDate',       label: '入社日' },
    { key: 'email',          label: 'メール' },
    { key: 'phone',          label: '電話番号' },
    { key: 'managerId',      label: '上司ID' },
    { key: 'grade',          label: '等級' },
    { key: 'employmentType', label: '雇用形態' },
  ];

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // BOM 除去
      const clean = text.replace(/^\uFEFF/, '');
      const lines = clean.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { alert('データ行がありません'); return; }

      const rawHeaders = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
      const labelToKey: Record<string, keyof Employee> = {};
      CSV_HEADERS.forEach(({ key, label }) => {
        labelToKey[label] = key;
        labelToKey[key]   = key;   // 英語ヘッダーも受け付ける
      });

      const colMap: Record<number, keyof Employee> = {};
      rawHeaders.forEach((h, i) => {
        const key = labelToKey[h] || labelToKey[h.toLowerCase()];
        if (key) colMap[i] = key;
      });

      const rows: Partial<Employee>[] = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const obj: Partial<Employee> = {};
        Object.entries(colMap).forEach(([i, key]) => {
          (obj as any)[key] = cols[+i] || '';
        });
        return obj;
      }).filter(r => r.id);

      setCsvPreview(rows);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleApplyCsvMerge = async () => {
    if (!csvPreview || csvPreview.length === 0) return;
    setCsvImporting(true);
    // フロントエンド: 既存データとマージ
    csvPreview.forEach(row => {
      const existing = employees.find(e => String(e.id).toUpperCase() === String(row.id).toUpperCase());
      const merged: Employee = {
        ...(existing || { id: row.id!, name: row.name || '', role: Role.TRAINEE }),
        ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== '')),
      } as Employee;
      if (existing) {
        onUpdateEmployee(merged);
      } else {
        onAddEmployee(merged);
      }
    });
    // GAS にも一括送信
    if (gasUrl) {
      try {
        await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'BULK_UPDATE_EMPLOYEES', employees: csvPreview }),
        });
      } catch (err) { console.error('GAS bulk update error:', err); }
    }
    alert(`${csvPreview.length}名のデータをマージしました。`);
    setCsvPreview(null);
    setCsvImporting(false);
  };

  const handleDownloadCsvTemplate = () => {
    const header = CSV_HEADERS.map(h => h.label).join(',');
    const example = 'EMP001,山田太郎,営業部,課長,S-001,2018-04-01,yamada@example.com,090-0000-0001,EMP000,G3,正社員';
    const blob = new Blob(
      [new Uint8Array([0xef, 0xbb, 0xbf]), `${header}\n${example}`],
      { type: 'text/csv;charset=utf-8;' },
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '社員CSVテンプレート.csv';
    link.click();
  };

  // ── 役職別権限 ──────────────────────────────────────────────────────────────
  const savePerm = (perm: PositionPermission) => {
    const updated = [
      ...positionPermissions.filter(p => p.position !== perm.position),
      perm,
    ];
    setPositionPermissions(updated);
    localStorage.setItem('sb_pos_perms', JSON.stringify(updated));
    if (gasUrl) {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'SAVE_POSITION_PERMISSION', permission: perm }),
      }).catch(() => {});
    }
    setEditingPerm(null);
    setNewPermPosition('');
  };

  const deletePerm = (position: string) => {
    const updated = positionPermissions.filter(p => p.position !== position);
    setPositionPermissions(updated);
    localStorage.setItem('sb_pos_perms', JSON.stringify(updated));
    if (gasUrl) {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'DELETE_POSITION_PERMISSION', position }),
      }).catch(() => {});
    }
  };

  const startNewPerm = () => {
    if (!newPermPosition.trim()) return;
    setEditingPerm({
      position: newPermPosition.trim(),
      viewableFields: ['id', 'name', 'department', 'position'],
      canViewAllDept: false,
      canViewSubordinates: false,
      canViewOwnOnly: true,
    });
  };

  const handleSubmit = () => {
    if (!formData.id.trim() || !formData.name.trim()) {
      alert("IDと名前は必須です");
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
      challengeTrainings: formData.challengeTrainings,
      employeeNo:     formData.employeeNo.trim()     || undefined,
      hireDate:       formData.hireDate.trim()       || undefined,
      email:          formData.email.trim()          || undefined,
      phone:          formData.phone.trim()          || undefined,
      managerId:      formData.managerId.trim()      || undefined,
      grade:          formData.grade.trim()          || undefined,
      employmentType: formData.employmentType.trim() || undefined,
    };

    if (editingEmployee) {
      onUpdateEmployee(employeeData);
    } else {
      onAddEmployee(employeeData);
    }
    resetForm();
  };

  const handleDelete = (employeeId: string) => {
    if (confirm("本当にこの社員を削除しますか？")) {
      onDeleteEmployee(employeeId);
    }
  };

  const toggleTrainingAssignment = (
    trainingId: string,
    type: "required" | "challenge",
  ) => {
    if (type === "required") {
      const isCurrentlyRequired =
        formData.requiredTrainings.includes(trainingId);
      if (isCurrentlyRequired) {
        setFormData((prev) => ({
          ...prev,
          requiredTrainings: prev.requiredTrainings.filter(
            (id) => id !== trainingId,
          ),
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          requiredTrainings: [...prev.requiredTrainings, trainingId],
          challengeTrainings: prev.challengeTrainings.filter(
            (id) => id !== trainingId,
          ),
        }));
      }
    } else {
      const isCurrentlyChallenge =
        formData.challengeTrainings.includes(trainingId);
      if (isCurrentlyChallenge) {
        setFormData((prev) => ({
          ...prev,
          challengeTrainings: prev.challengeTrainings.filter(
            (id) => id !== trainingId,
          ),
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          challengeTrainings: [...prev.challengeTrainings, trainingId],
          requiredTrainings: prev.requiredTrainings.filter(
            (id) => id !== trainingId,
          ),
        }));
      }
    }
  };

  const getTrainingStatus = (trainingId: string, isGlobal: boolean) => {
    if (isGlobal) return "global_required";
    if (formData.requiredTrainings.includes(trainingId)) return "required";
    if (formData.challengeTrainings.includes(trainingId)) return "challenge";
    return "hidden";
  };

  // 社員の有効な必須研修（全員必須 OR 個人設定）
  const getEffectiveRequired = (employee: Employee) => {
    const globalRequired = trainings
      .filter((t) => t.isRequiredForAll)
      .map((t) => t.id);
    const personalRequired = employee.requiredTrainings || [];
    return [...new Set([...globalRequired, ...personalRequired])];
  };

  // ペナルティ計算
  const getPenalty = (employee: Employee, fy?: number): number => {
    const effectiveRequired = getEffectiveRequired(employee).filter((tId) => {
      if (!fy) return true;
      const t = trainings.find((tr) => tr.id === tId);
      return (t?.fiscalYear || getCurrentFiscalYear()) === fy;
    });
    const empId = String(employee.id).trim().toUpperCase();
    const incompleteCount = effectiveRequired.filter((tId) => {
      const result = results.find(
        (r) =>
          String(r.trainingId).trim().toUpperCase() === tId.toUpperCase() &&
          String(r.employeeId).trim().toUpperCase() === empId,
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
    results.forEach((r) => {
      if (String(r.employeeId).trim().toUpperCase() !== empId) return;
      // 講義情報を取得
      const training = trainings.find(
        (t) => t.id.toUpperCase() === String(r.trainingId).trim().toUpperCase(),
      );
      if (!training) return;

      // 年度フィルター
      if (fy && (training.fiscalYear || getCurrentFiscalYear()) !== fy) return;

      // 必須講義は対象外
      if (
        effectiveRequired.some(
          (tId) =>
            tId.toUpperCase() === String(r.trainingId).trim().toUpperCase(),
        )
      )
        return;
      // 受講完了
      if (!isCompleted(r)) return;

      const score = r.postScore as number;
      const activePattern =
        training?.patterns?.find((p) => p.id === training.activePatternId) ||
        training?.patterns?.[0];
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

  const getTermFromFiscalYear = (fy: number) => fy - 1977;

  const currentFY = getCurrentFiscalYear();

  const BACKUP_KEYS = [
    "sb_employees",
    "sb_trainings",
    "sb_training_flags",
    "sb_results",
    "sb_wrong_answer_analyses",
    "sb_announcements",
    "sb_gas_url",
    "sb_clliq_url",
    "sb_manual_api_key",
  ];

  const handleBackup = () => {
    const backup: Record<string, any> = {
      _version: 1,
      _exportedAt: new Date().toISOString(),
    };
    BACKUP_KEYS.forEach((key) => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try {
          backup[key] = JSON.parse(val);
        } catch {
          backup[key] = val;
        }
      }
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const link = document.createElement("a");
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
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
        if (!data || typeof data !== "object")
          throw new Error("不正なファイル");
        const restoredKeys: string[] = [];
        BACKUP_KEYS.forEach((key) => {
          if (key in data) {
            localStorage.setItem(key, JSON.stringify(data[key]));
            restoredKeys.push(key);
          }
        });
        alert(`復元完了（${restoredKeys.length}件）。ページをリロードします。`);
        window.location.reload();
      } catch {
        alert("復元に失敗しました。バックアップファイルを確認してください。");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDownloadEmployeeList = () => {
    const headers = ["ID", "氏名", "役割", "部署", "役職"];
    const csvRows = [headers.join(",")];

    employees.forEach((emp) => {
      const roleLabel =
        emp.role === Role.TRAINER
          ? "講義作成"
          : emp.role === Role.HR
            ? "HR分析"
            : "受講者";
      const row = [
        emp.id,
        emp.name,
        roleLabel,
        emp.department || "",
        emp.position || "",
      ];
      csvRows.push(
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      );
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvString], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    link.href = URL.createObjectURL(blob);
    link.download = `社員一覧_${dateStr}.csv`;
    link.click();
  };

  const handleDownload = () => {
    const termLabel = isYearlyView
      ? `${getTermFromFiscalYear(selectedFiscalYear)}年度`
      : "通算";
    const headers = [
      "ID",
      "氏名",
      "必須(完了/全)",
      "任意完了",
      "評価マイナス",
      "数量UP加点",
      "年度",
    ];
    const csvRows = [headers.join(",")];

    employees.forEach((emp) => {
      const fy = isYearlyView ? selectedFiscalYear : undefined;
      const effectiveRequired = getEffectiveRequired(emp).filter((tId) => {
        if (!fy) return true;
        const t = trainings.find((tr) => tr.id === tId);
        return (t?.fiscalYear || currentFY) === fy;
      });
      const empId = String(emp.id).trim().toUpperCase();
      const completedRequired = effectiveRequired.filter((tId) => {
        const result = results.find(
          (r) =>
            String(r.trainingId).trim().toUpperCase() === tId.toUpperCase() &&
            String(r.employeeId).trim().toUpperCase() === empId,
        );
        return isCompleted(result);
      }).length;

      const optionalDone = results.filter((r) => {
        if (String(r.employeeId).trim().toUpperCase() !== empId) return false;
        if (!isCompleted(r)) return false;
        const isReq = getEffectiveRequired(emp).some(
          (tId) =>
            tId.toUpperCase() === String(r.trainingId).trim().toUpperCase(),
        );
        if (isReq) return false;
        if (fy) {
          const t = trainings.find((tr) => tr.id === r.trainingId);
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
        termLabel,
      ];
      csvRows.push(row.join(","));
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvString], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    link.href = URL.createObjectURL(blob);
    link.download = `Skill点数_${dateStr}.csv`;
    link.click();

    // 蓄積用データを保存 (GASに送る)
    employees.forEach((emp) => {
      const fy = isYearlyView ? selectedFiscalYear : currentFY;
      const effectiveRequired = getEffectiveRequired(emp).filter((tId) => {
        const t = trainings.find((tr) => tr.id === tId);
        return (t?.fiscalYear || currentFY) === fy;
      });
      const empId = String(emp.id).trim().toUpperCase();
      const completedRequired = effectiveRequired.filter((tId) => {
        const result = results.find(
          (r) =>
            String(r.trainingId).trim().toUpperCase() === tId.toUpperCase() &&
            String(r.employeeId).trim().toUpperCase() === empId,
        );
        return isCompleted(result);
      }).length;

      const optionalDone = results.filter((r) => {
        if (String(r.employeeId).trim().toUpperCase() !== empId) return false;
        if (!isCompleted(r)) return false;
        const isReq = getEffectiveRequired(emp).some(
          (tId) =>
            tId.toUpperCase() === String(r.trainingId).trim().toUpperCase(),
        );
        if (isReq) return false;
        const t = trainings.find((tr) => tr.id === r.trainingId);
        return (t?.fiscalYear || currentFY) === fy;
      }).length;

      const penalty = getPenalty(emp, fy);
      const bonus = getBonus(emp, fy);

      // 深層心理分析（traits/competenciesの履歴を統合）
      const empResults = results.filter(
        (r) =>
          String(r.employeeId).trim().toUpperCase() === empId && isCompleted(r),
      );
      const allTraits = [
        ...new Set(empResults.flatMap((r) => r.traits || [])),
      ].join(" / ");

      const summary = {
        id: emp.id,
        name: emp.name,
        requiredTotal: effectiveRequired.length,
        requiredDone: completedRequired,
        optionalDone: optionalDone,
        penalty: penalty,
        bonus: bonus,
        fiscalYear: fy,
        psychologyAnalysis: allTraits,
      };

      // GAS API call via fetch
      if (gasUrl) {
        fetch(gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ type: "SAVE_ANNUAL_SUMMARY", summary }),
        })
          .then(() => console.log("Saved annual summary for", emp.name))
          .catch((err) => console.error("GAS sync error:", err));
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* データ管理 */}
      <div className="flex items-center gap-3 p-4 bg-slate-800 rounded-2xl border border-slate-700">
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
          データ管理
        </span>
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
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            onChange={handleRestore}
            className="hidden"
          />
        </div>
      </div>
      <div className="flex justify-between items-center bg-slate-100 p-2 rounded-2xl border border-slate-200">
        <div className="flex gap-2">
          <button
            onClick={() => setIsYearlyView(true)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${isYearlyView ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-200"}`}
          >
            {getTermFromFiscalYear(selectedFiscalYear)}年度分
          </button>
          <button
            onClick={() => setIsYearlyView(false)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${!isYearlyView ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-200"}`}
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
            {Array.from({ length: 5 }, (_, i) => currentFY - 2 + i).map((y) => (
              <option key={y} value={y}>
                {getTermFromFiscalYear(y)}年度
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── メインタブ ── */}
      <div className="flex bg-slate-100 p-1 rounded-2xl gap-0.5">
        {([
          { id: 'list',        label: '👥 社員一覧・管理' },
          { id: 'csv',         label: '📂 CSV一括取込' },
          { id: 'permissions', label: '🔐 役職別権限設定' },
        ] as { id: typeof mainTab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => { setMainTab(t.id); setIsCreating(false); }}
            className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${mainTab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'list' && (
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-slate-800">👥 社員管理</h2>
        <div className="flex gap-3">
          <button onClick={handleDownloadEmployeeList}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-2xl transition-all shadow-lg flex items-center gap-2">
            📋 社員一覧CSV
          </button>
          <button onClick={handleDownload}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-all shadow-lg flex items-center gap-2">
            📥 ダウンロード
          </button>
          <button onClick={() => setIsCreating(!isCreating)}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg">
            {isCreating ? "✕ キャンセル" : "+ 新規追加"}
          </button>
        </div>
      </div>
      )}

      {mainTab === 'list' && isCreating && (
        <div className="bg-white p-6 rounded-2xl border-2 border-indigo-200 shadow-lg">
          <h3 className="text-lg font-black text-slate-800 mb-4">
            {editingEmployee ? "社員情報編集" : "新しい社員"}
          </h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  社員ID
                </label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, id: e.target.value }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                  placeholder="001"
                  disabled={!!editingEmployee}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  名前
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                  placeholder="山田太郎"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  役割
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      role: e.target.value as Role,
                    }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                >
                  <option value={Role.TRAINEE}>受講者</option>
                  <option value={Role.TRAINER}>講義作成</option>
                  <option value={Role.HR}>HR分析</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  パスワード {editingEmployee && "(変更する場合のみ入力)"}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                  placeholder="6桁の数字"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">部署</label>
                <input type="text" value={formData.department}
                  onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                  placeholder="営業部" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">役職</label>
                <input type="text" value={formData.position}
                  onChange={e => setFormData(p => ({ ...p, position: e.target.value }))}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                  placeholder="主任" />
              </div>
            </div>

            {/* ── 拡張個人データ ── */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-black text-indigo-600 py-2 select-none list-none flex items-center gap-2">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                拡張個人データ（社員番号・連絡先・等級など）
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-4">
                {([
                  { field: 'employeeNo',     label: '社員番号',   placeholder: 'S-001',          type: 'text' },
                  { field: 'hireDate',       label: '入社日',     placeholder: '2020-04-01',     type: 'date' },
                  { field: 'email',          label: 'メール',     placeholder: 'user@example.com', type: 'email' },
                  { field: 'phone',          label: '電話番号',   placeholder: '090-0000-0000',  type: 'text' },
                  { field: 'managerId',      label: '上司ID',     placeholder: 'EMP001',         type: 'text' },
                  { field: 'grade',          label: '等級',       placeholder: 'G3',             type: 'text' },
                ] as { field: keyof typeof formData; label: string; placeholder: string; type: string }[]).map(({ field, label, placeholder, type }) => (
                  <div key={field}>
                    <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
                    <input type={type} value={formData[field] as string}
                      onChange={e => setFormData(p => ({ ...p, [field]: e.target.value }))}
                      className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none"
                      placeholder={placeholder} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">雇用形態</label>
                  <select value={formData.employmentType}
                    onChange={e => setFormData(p => ({ ...p, employmentType: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:border-indigo-400 focus:outline-none">
                    <option value="">選択してください</option>
                    {['正社員', '契約社員', '派遣社員', 'パート・アルバイト', '業務委託'].map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            </details>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">
                講義設定
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto bg-slate-50 p-4 rounded-xl">
                {trainings.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    講義がまだありません
                  </p>
                ) : (
                  trainings.map((training) => {
                    const isGlobal = training.isRequiredForAll || false;
                    const status = getTrainingStatus(training.id, isGlobal);
                    return (
                      <div
                        key={training.id}
                        className={`flex items-center justify-between p-3 bg-white rounded-lg border ${isGlobal ? "border-rose-200 bg-rose-50" : ""}`}
                      >
                        <div>
                          <span className="text-sm font-bold text-slate-700">
                            {training.title}
                          </span>
                          {isGlobal && (
                            <span className="ml-2 text-[10px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">
                              全員必須
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {isGlobal ? (
                            <span className="px-3 py-1 text-xs font-black text-rose-700 bg-rose-100 border-2 border-rose-400 rounded-lg">
                              🔴 必須（全員）
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() =>
                                  toggleTrainingAssignment(
                                    training.id,
                                    "required",
                                  )
                                }
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                  status === "required"
                                    ? "bg-rose-100 text-rose-700 border-2 border-rose-500"
                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                }`}
                              >
                                必須
                              </button>
                              <button
                                onClick={() =>
                                  toggleTrainingAssignment(
                                    training.id,
                                    "challenge",
                                  )
                                }
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                  status === "challenge"
                                    ? "bg-blue-100 text-blue-700 border-2 border-blue-500"
                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                }`}
                              >
                                任意
                              </button>
                              {status !== "hidden" && (
                                <button
                                  onClick={() => {
                                    setFormData((prev) => ({
                                      ...prev,
                                      requiredTrainings:
                                        prev.requiredTrainings.filter(
                                          (id) => id !== training.id,
                                        ),
                                      challengeTrainings:
                                        prev.challengeTrainings.filter(
                                          (id) => id !== training.id,
                                        ),
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
              {editingEmployee ? "更新" : "追加"}
            </button>
          </div>
        </div>
      )}

      {mainTab === 'list' && <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-600">
          登録済み社員 ({employees.length}名)
        </h3>
        {employees.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-bold">
              社員がまだ登録されていません
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees.map((employee) => {
              const penalty = getPenalty(
                employee,
                isYearlyView ? selectedFiscalYear : undefined,
              );
              const bonus = getBonus(
                employee,
                isYearlyView ? selectedFiscalYear : undefined,
              );
              const empId = String(employee.id).trim().toUpperCase();
              const effectiveRequired = getEffectiveRequired(employee).filter(
                (tId) => {
                  if (!isYearlyView) return true;
                  const t = trainings.find((tr) => tr.id === tId);
                  return (t?.fiscalYear || currentFY) === selectedFiscalYear;
                },
              );
              const completedRequired = effectiveRequired.filter((tId) => {
                const result = results.find(
                  (r) =>
                    String(r.trainingId).trim().toUpperCase() ===
                      tId.toUpperCase() &&
                    String(r.employeeId).trim().toUpperCase() === empId,
                );
                return isCompleted(result);
              }).length;
              const incompleteRequired =
                effectiveRequired.length - completedRequired;

              return (
                <div
                  key={employee.id}
                  className="p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-indigo-300 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-black text-slate-800">
                        {employee.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        ID: {employee.id}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-bold rounded ${
                        employee.role === Role.TRAINER
                          ? "bg-indigo-100 text-indigo-700"
                          : employee.role === Role.HR
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {employee.role === Role.TRAINER
                        ? "講義作成"
                        : employee.role === Role.HR
                          ? "HR分析"
                          : "受講者"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 mb-2">
                    {employee.department && (
                      <div>部署: {employee.department}</div>
                    )}
                    {employee.position && <div>役職: {employee.position}</div>}
                    <div>
                      必須: {effectiveRequired.length}件（完了:{" "}
                      {completedRequired}件）
                    </div>
                    <div>
                      任意:{" "}
                      {
                        results.filter((r) => {
                          if (
                            String(r.employeeId).trim().toUpperCase() !== empId
                          )
                            return false;
                          if (!isCompleted(r)) return false;
                          const isReq = getEffectiveRequired(employee).some(
                            (tId) =>
                              tId.toUpperCase() ===
                              String(r.trainingId).trim().toUpperCase(),
                          );
                          if (isReq) return false;
                          if (isYearlyView) {
                            const t = trainings.find(
                              (tr) => tr.id === r.trainingId,
                            );
                            return (
                              (t?.fiscalYear || currentFY) ===
                              selectedFiscalYear
                            );
                          }
                          return true;
                        }).length
                      }
                      件
                    </div>
                  </div>

                  {(() => {
                    const hasScore = penalty !== 0 || bonus !== 0;
                    const total = penalty + bonus;
                    if (!hasScore && effectiveRequired.length === 0)
                      return null;
                    return (
                      <div className="mb-3 rounded-xl border overflow-hidden">
                        {penalty !== 0 && (
                          <div className="px-3 py-1.5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
                            <span className="text-[10px] font-black text-rose-500 uppercase">
                              評価マイナス
                            </span>
                            <span className="text-xs font-black text-rose-700">
                              {penalty}点
                            </span>
                          </div>
                        )}
                        {bonus > 0 && (
                          <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                            <span className="text-[10px] font-black text-emerald-600 uppercase">
                              数量UP加点
                            </span>
                            <span className="text-xs font-black text-emerald-700">
                              +{bonus}点
                            </span>
                          </div>
                        )}
                        {incompleteRequired === 0 &&
                          effectiveRequired.length > 0 &&
                          penalty === 0 && (
                            <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                              <span className="text-[10px] font-black text-emerald-600 uppercase">
                                必須完了
                              </span>
                              <span className="text-xs font-black text-emerald-700">
                                ✓
                              </span>
                            </div>
                          )}
                        {hasScore && (
                          <div
                            className={`px-3 py-1.5 flex items-center justify-between ${total >= 0 ? "bg-slate-50" : "bg-rose-100"}`}
                          >
                            <span className="text-[10px] font-black text-slate-600 uppercase">
                              合計
                            </span>
                            <span
                              className={`text-sm font-black ${total > 0 ? "text-emerald-700" : total < 0 ? "text-rose-700" : "text-slate-600"}`}
                            >
                              {total > 0 ? "+" : ""}
                              {total}点
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
      </div>}

      {/* ── CSV 一括取込タブ ── */}
      {mainTab === 'csv' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border-2 border-slate-200">
            <h3 className="text-lg font-black text-slate-800 mb-1">📂 CSV 一括取込・マージ</h3>
            <p className="text-xs text-slate-500 mb-4">既存社員のデータはIDで照合してマージされます。新規IDは追加、既存IDは空でないフィールドのみ上書きします。</p>

            <div className="flex gap-3 mb-4">
              <button
                onClick={handleDownloadCsvTemplate}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all"
              >
                📄 テンプレートCSVをダウンロード
              </button>
              <button
                onClick={() => csvImportRef.current?.click()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all"
              >
                📂 CSVファイルを選択
              </button>
              <input ref={csvImportRef} type="file" accept=".csv" onChange={handleCsvFileSelect} className="hidden" />
            </div>

            <div className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3 mb-4">
              <div className="font-bold mb-1">対応ヘッダー（日本語・英語どちらでも可）：</div>
              <div className="flex flex-wrap gap-1">
                {CSV_HEADERS.map(h => (
                  <span key={h.key} className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg">{h.label} / {h.key}</span>
                ))}
              </div>
            </div>

            {csvPreview && csvPreview.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">プレビュー: {csvPreview.length}行</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCsvPreview(null)}
                      className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleApplyCsvMerge}
                      disabled={csvImporting}
                      className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all disabled:opacity-50"
                    >
                      {csvImporting ? 'マージ中…' : '✓ マージを実行'}
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        {CSV_HEADERS.map(h => (
                          <th key={h.key} className="px-3 py-2 text-left text-slate-600 font-bold whitespace-nowrap">{h.label}</th>
                        ))}
                        <th className="px-3 py-2 text-left text-slate-600 font-bold">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, i) => {
                        const isExisting = employees.some(e => String(e.id).toUpperCase() === String(row.id).toUpperCase());
                        return (
                          <tr key={i} className={`border-t border-slate-100 ${isExisting ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                            {CSV_HEADERS.map(h => (
                              <td key={h.key} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{(row as any)[h.key] || ''}</td>
                            ))}
                            <td className="px-3 py-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isExisting ? 'bg-amber-200 text-amber-700' : 'bg-emerald-200 text-emerald-700'}`}>
                                {isExisting ? '更新' : '新規'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!csvPreview && (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <p className="text-slate-400 text-sm font-bold">CSVファイルを選択してプレビューを確認してください</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 役職別権限設定タブ ── */}
      {mainTab === 'permissions' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border-2 border-slate-200">
            <h3 className="text-lg font-black text-slate-800 mb-1">🔐 役職別アクセス権限設定</h3>
            <p className="text-xs text-slate-500 mb-4">役職ごとに閲覧できる項目と閲覧範囲を設定します。</p>

            {/* 既存権限一覧 */}
            {positionPermissions.length > 0 && (
              <div className="space-y-2 mb-4">
                {positionPermissions.map(perm => (
                  <div key={perm.position} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-sm font-black text-slate-800">{perm.position}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {perm.canViewAllDept ? '全部署閲覧' : perm.canViewSubordinates ? '部下閲覧' : '自分のみ'}
                        　閲覧可: {perm.viewableFields.length}項目
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingPerm(perm)}
                        className="px-3 py-1 text-xs font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-all"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => { if (confirm(`「${perm.position}」の権限設定を削除しますか？`)) deletePerm(perm.position); }}
                        className="px-3 py-1 text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg transition-all"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 新規追加 */}
            {!editingPerm && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPermPosition}
                  onChange={e => setNewPermPosition(e.target.value)}
                  placeholder="役職名を入力 (例: 部長)"
                  className="flex-1 px-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button
                  onClick={startNewPerm}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all"
                >
                  + 追加
                </button>
              </div>
            )}
          </div>

          {/* 権限編集フォーム */}
          {editingPerm && (
            <div className="bg-white p-6 rounded-2xl border-2 border-indigo-200 shadow-lg">
              <h4 className="text-base font-black text-slate-800 mb-4">
                「{editingPerm.position}」の権限設定
              </h4>

              {/* 閲覧範囲 */}
              <div className="mb-4">
                <div className="text-sm font-bold text-slate-700 mb-2">閲覧範囲</div>
                <div className="flex flex-col gap-2">
                  {[
                    { key: 'canViewAllDept',      label: '全部署の社員データを閲覧可' },
                    { key: 'canViewSubordinates', label: '部下のデータを閲覧可' },
                    { key: 'canViewOwnOnly',      label: '自分のデータのみ' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(editingPerm as any)[key]}
                        onChange={e => setEditingPerm(prev => prev ? { ...prev, [key]: e.target.checked } : prev)}
                        className="w-4 h-4 rounded accent-indigo-600"
                      />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 閲覧可能フィールド */}
              <div className="mb-4">
                <div className="text-sm font-bold text-slate-700 mb-2">閲覧できる項目</div>
                {['基本', '個人情報', '分析データ'].map(group => (
                  <div key={group} className="mb-3">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-1">{group}</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                      {ALL_FIELDS.filter(f => f.group === group).map(f => (
                        <label key={f.key} className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded-lg hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={editingPerm.viewableFields.includes(f.key)}
                            onChange={e => {
                              const fields = e.target.checked
                                ? [...editingPerm.viewableFields, f.key]
                                : editingPerm.viewableFields.filter(k => k !== f.key);
                              setEditingPerm(prev => prev ? { ...prev, viewableFields: fields } : prev);
                            }}
                            className="w-3.5 h-3.5 rounded accent-indigo-600"
                          />
                          <span className="text-xs text-slate-700">{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingPerm(null); setNewPermPosition(''); }}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => savePerm(editingPerm)}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
