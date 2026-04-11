
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Employee, TestResult, Training } from '../../types';
import * as XLSX from 'xlsx';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts';

// ─────────────────────────────────────────────────────────────
// コンピテンシー定義（最新HR理論ベース）
// ─────────────────────────────────────────────────────────────
const COMPETENCY_GROUPS = [
  { key: 'core',  label: 'コア・コンピテンシー', color: '#6366f1', items: [
    { key: 'problemSolving',   label: '問題解決力' },
    { key: 'criticalThinking', label: '批判的思考' },
    { key: 'learningAgility',  label: '学習敏捷性' },
  ]},
  { key: 'comm',  label: 'コミュニケーション', color: '#ec4899', items: [
    { key: 'interpersonal', label: '対人コミュニケーション' },
    { key: 'stakeholder',   label: 'ステークホルダー調整力' },
    { key: 'presentation',  label: 'プレゼンテーション力' },
  ]},
  { key: 'lead',  label: 'リーダーシップ', color: '#f59e0b', items: [
    { key: 'decisionMaking', label: '意思決定力' },
    { key: 'teamManagement', label: 'チームマネジメント' },
    { key: 'coaching',       label: 'コーチング・育成力' },
  ]},
  { key: 'collab', label: 'コラボレーション', color: '#10b981', items: [
    { key: 'teamwork',   label: 'チームワーク' },
    { key: 'psychSafety', label: '心理的安全性の醸成' },
    { key: 'crossDept',  label: '部門横断の協働力' },
  ]},
  { key: 'innov', label: 'イノベーション', color: '#8b5cf6', items: [
    { key: 'creativity',    label: '創造性' },
    { key: 'improvement',   label: '改善提案力' },
    { key: 'ideaExecution', label: '新規アイデアの実行力' },
  ]},
] as const;

type GroupKey = typeof COMPETENCY_GROUPS[number]['key'];
type ItemKey  = typeof COMPETENCY_GROUPS[number]['items'][number]['key'];

const ALL_ITEM_KEYS = COMPETENCY_GROUPS.flatMap(g => g.items.map(i => i.key as string));
const DEF_RAW: Record<string, number> = Object.fromEntries(ALL_ITEM_KEYS.map(k => [k, 3]));
const DEF_MGR: Record<string, number> = Object.fromEntries(COMPETENCY_GROUPS.map(g => [g.key, 3]));

// 各アイテムキー → 所属グループキー
const KEY_TO_GROUP: Record<string, string> = {};
COMPETENCY_GROUPS.forEach(g => g.items.forEach(item => { KEY_TO_GROUP[item.key] = g.key; }));

// ─────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────
interface Incident   { id: string; date: string; description: string; }
interface SalesRecord {
  id: string; period: string;
  salesTarget: number; salesActual: number; achievementRate: number;
  profitAmount: number; profitRate: number;
  importedAt: string;
}
interface ParsedSWOT  { id: string; name: string; mods: Record<string, number>; }
interface ParsedSales { id: string; name: string; period: string; salesTarget: number; salesActual: number; achievementRate: number; profitAmount: number; profitRate: number; }

// ─────────────────────────────────────────────────────────────
// localStorage ユーティリティ
// ─────────────────────────────────────────────────────────────
const ls = {
  load: <T,>(key: string, def: T): T => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  save: (key: string, val: unknown) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

// ─────────────────────────────────────────────────────────────
// スコア計算
//  最終スコア = AutoScore(70%) + 部長スコア(30%)
//  AutoScore  = clamp(rawScore + SWOTmod + SalesMod + ComplianceMod, 1, 5)
// ─────────────────────────────────────────────────────────────
const clamp = (v: number, lo = 1, hi = 5) => Math.min(hi, Math.max(lo, v));

const computeFinalScores = (
  raw: Record<string, number>,
  swot: Record<string, number>,
  sales: Record<string, number>,
  comp: Record<string, number>,
  mgr: Record<string, number>,
): Record<string, number> => {
  const result: Record<string, number> = {};
  ALL_ITEM_KEYS.forEach(k => {
    const autoScore = clamp((raw[k] ?? 3) + (swot[k] ?? 0) + (sales[k] ?? 0) + (comp[k] ?? 0));
    const mgrScore  = mgr[KEY_TO_GROUP[k]] ?? 3;
    result[k] = +( autoScore * 0.7 + mgrScore * 0.3 ).toFixed(2);
  });
  return result;
};

// ─────────────────────────────────────────────────────────────
// SWOT生スコア (S/W/O/T 各1〜5) → コンピテンシーモディファイア
// ─────────────────────────────────────────────────────────────
const swotRawToMods = (S: number, W: number, O: number, T: number): Record<string, number> => {
  const n = (v: number) => (v - 3) / 2; // -1 〜 +1
  const s = n(S), w = n(W), o = n(O), t = n(T);
  const m = (v: number) => +v.toFixed(2);
  return {
    problemSolving:   m(s * 0.6 + t * 0.4),
    criticalThinking: m(s * 0.5 + t * 0.5),
    learningAgility:  m(o * 0.6 - w * 0.4),
    interpersonal:    m(s * 0.4 + o * 0.6),
    stakeholder:      m(s * 0.5 + t * 0.5),
    presentation:     m(s * 0.7 + o * 0.3),
    decisionMaking:   m(s * 0.8 - w * 0.2),
    teamManagement:   m(s * 0.6 - w * 0.4),
    coaching:         m(s * 0.5 - w * 0.5),
    teamwork:         m(s * 0.4 + o * 0.6),
    psychSafety:      m(s * 0.5 + o * 0.5),
    crossDept:        m(o * 0.7 - t * 0.3),
    creativity:       m(o * 0.8 - w * 0.2),
    improvement:      m(o * 0.7 + s * 0.3),
    ideaExecution:    m(o * 0.7 - w * 0.3),
  };
};

// ─────────────────────────────────────────────────────────────
// 売上達成率 → コンピテンシーモディファイア
// ─────────────────────────────────────────────────────────────
const salesRecordsToMods = (records: SalesRecord[]): Record<string, number> => {
  if (!records.length) return {};
  const avgRate = records.reduce((s, r) => s + r.achievementRate, 0) / records.length;
  const k = avgRate >= 100 ? 0.5 : avgRate >= 80 ? 0.2 : avgRate >= 60 ? -0.2 : -0.5;
  const m = (v: number) => +v.toFixed(2);
  return {
    problemSolving:   m(k * 0.8),
    decisionMaking:   m(k * 1.0),
    teamManagement:   m(k * 0.6),
    coaching:         m(k * 0.4),
    improvement:      m(k * 0.6),
    criticalThinking: m(k * 0.4),
    stakeholder:      m(k * 0.4),
    ideaExecution:    m(k * 0.3),
  };
};

// ─────────────────────────────────────────────────────────────
// コンプライアンス（未回答・遅延） → モディファイア（自動計算）
// ─────────────────────────────────────────────────────────────
const computeComplianceMods = (
  empId: string,
  results: TestResult[],
  trainings: Training[],
): Record<string, number> => {
  if (!trainings.length) return {};
  const deadlines: { trainingId: string; deadline1: string }[] =
    ls.load('sb_deadlines', []);

  let unanswered = 0, late = 0;

  trainings.forEach(t => {
    const r = results.find(
      res => res.trainingId === t.id &&
        String(res.employeeId).trim().toUpperCase() === String(empId).trim().toUpperCase()
    );
    const done = r && r.postScore !== -1 && r.postScore !== null && r.postScore !== undefined;
    if (!done) {
      unanswered++;
    } else {
      const dl = deadlines.find(d => d.trainingId === t.id);
      if (dl?.deadline1 && new Date(r!.completedAt) > new Date(dl.deadline1)) late++;
    }
  });

  const n = trainings.length;
  const missPen = Math.max(-1.5, -(unanswered / n) * 1.5);
  const latePen  = Math.max(-0.8, -(late / n) * 0.8);
  const m = (v: number) => +v.toFixed(2);
  return {
    learningAgility: m((missPen + latePen) * 0.8),
    interpersonal:   m(missPen * 0.3),
    teamwork:        m(missPen * 0.2),
    psychSafety:     m(latePen * 0.2),
  };
};

// ─────────────────────────────────────────────────────────────
// ファイルパース (CSV/TXT/XLSX → string[][])
// ─────────────────────────────────────────────────────────────
const parseFileToRows = async (file: File): Promise<string[][]> => {
  if (/\.(csv|txt)$/i.test(file.name)) {
    const text = await file.text();
    const firstLine = text.split('\n')[0];
    const delim = firstLine.includes('\t') ? '\t' : ',';
    return text.trim().split(/\r?\n/)
      .map(line => line.split(delim).map(c => c.trim().replace(/^"|"$/g, '')))
      .filter(row => row.some(c => c !== ''));
  }
  // Excel
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][])
    .filter(row => (row as string[]).some(c => String(c) !== ''));
};

// ─────────────────────────────────────────────────────────────
// SWOTファイルパース
// ─────────────────────────────────────────────────────────────
const parseSWOT = (rows: string[][]): ParsedSWOT[] => {
  if (rows.length < 2) return [];
  const header = rows[0].map(h => String(h).toLowerCase().replace(/[\s_　（）()]/g, ''));
  const fc = (kws: string[]) => header.findIndex(h => kws.some(k => h.includes(k)));

  const idCol   = fc(['社員id', 'id', 'empid', '社員番号', '番号']);
  const nameCol = fc(['氏名', '名前', 'name']);

  // フォーマット判定
  const isSwotRaw = header.some(h => h.includes('強み') || h.includes('strength') || h.includes('弱み'));
  const isDirectComp = header.some(h =>
    h.includes('問題解決') || h.includes('problemsolving') || h.includes('criticalthinking') || h.includes('批判的思考'));

  // 直接コンピテンシー形式のヘッダー→キー対応表
  const LABEL_TO_KEY: Record<string, string> = {
    '問題解決力':'problemSolving', '問題解決':'problemSolving',
    '批判的思考':'criticalThinking',
    '学習敏捷性':'learningAgility', '学習':'learningAgility',
    '対人コミュニケーション':'interpersonal', '対人':'interpersonal',
    'ステークホルダー調整力':'stakeholder', 'ステークホルダー':'stakeholder',
    'プレゼンテーション力':'presentation', 'プレゼン':'presentation',
    '意思決定力':'decisionMaking', '意思決定':'decisionMaking',
    'チームマネジメント':'teamManagement', 'チーム管理':'teamManagement',
    'コーチング育成力':'coaching', 'コーチング':'coaching',
    'チームワーク':'teamwork',
    '心理的安全性の醸成':'psychSafety', '心理的安全性':'psychSafety',
    '部門横断の協働力':'crossDept', '部門横断':'crossDept',
    '創造性':'creativity',
    '改善提案力':'improvement', '改善提案':'improvement',
    '新規アイデアの実行力':'ideaExecution', 'アイデア実行力':'ideaExecution',
  };
  // ヘッダー列とキーの対応（直接形式用）
  const colToKey: Record<number, string> = {};
  if (isDirectComp) {
    rows[0].forEach((h, ci) => {
      const norm = String(h).replace(/[\s　]/g, '');
      const k = LABEL_TO_KEY[norm];
      if (k) colToKey[ci] = k;
    });
  }

  return rows.slice(1).map(row => {
    const id   = String(row[idCol   >= 0 ? idCol   : 0] ?? '').trim();
    const name = String(row[nameCol >= 0 ? nameCol : 1] ?? '').trim();
    let mods: Record<string, number> = {};

    if (isSwotRaw) {
      const sC = fc(['強み', 'strength', 's得点', 's点', 's']);
      const wC = fc(['弱み', 'weakness', 'w得点', 'w点', 'w']);
      const oC = fc(['機会', 'opportunity', 'o得点', 'o点', 'o']);
      const tC = fc(['脅威', 'threat', 't得点', 't点', 't']);
      mods = swotRawToMods(
        +row[sC] || 3, +row[wC] || 3,
        +row[oC] || 3, +row[tC] || 3,
      );
    } else if (isDirectComp) {
      Object.entries(colToKey).forEach(([ci, k]) => {
        const score = parseFloat(String(row[+ci] ?? '3')) || 3;
        mods[k] = +((score - 3) / 2).toFixed(2); // 1-5 → -1〜+1 modifier
      });
    }
    return { id, name, mods };
  }).filter(r => r.id || r.name);
};

// ─────────────────────────────────────────────────────────────
// 売上ファイルパース
// ─────────────────────────────────────────────────────────────
const parseSalesFile = (rows: string[][]): ParsedSales[] => {
  if (rows.length < 2) return [];
  const header = rows[0].map(h => String(h).toLowerCase().replace(/[\s_　（）()]/g, ''));
  const fc = (kws: string[]) => header.findIndex(h => kws.some(k => h.includes(k)));
  const fmtNum = (v: string) => parseFloat(v.replace(/[,，¥\\%％]/g, '')) || 0;

  const idC      = fc(['社員id', 'id', '社員番号']);
  const nameC    = fc(['氏名', '名前', 'name']);
  const periodC  = fc(['期間', '年度', 'period', '年月', '月']);
  const tgtC     = fc(['売上目標', '目標売上', '目標', 'target', '計画']);
  const actC     = fc(['売上実績', '実績売上', '実績', 'actual', '売上']);
  const rateC    = fc(['達成率', 'achievement', '達成', 'rate']);
  const profAmtC = fc(['利益額', '粗利額', '利益', 'profit', '粗利']);
  const profRatC = fc(['利益率', '粗利率', 'profitrate', 'marginrate']);

  return rows.slice(1).map(row => {
    const salesTarget = fmtNum(String(row[tgtC] ?? '0'));
    const salesActual = fmtNum(String(row[actC] ?? '0'));
    let achievementRate = fmtNum(String(row[rateC] ?? '0'));
    if (!achievementRate && salesTarget) achievementRate = +(salesActual / salesTarget * 100).toFixed(1);

    return {
      id:              String(row[idC   >= 0 ? idC   : 0] ?? '').trim(),
      name:            String(row[nameC >= 0 ? nameC : 1] ?? '').trim(),
      period:          String(row[periodC >= 0 ? periodC : 2] ?? `行${rows.indexOf(row)}`).trim(),
      salesTarget,
      salesActual,
      achievementRate: +achievementRate.toFixed(1),
      profitAmount:    fmtNum(String(row[profAmtC] ?? '0')),
      profitRate:      +fmtNum(String(row[profRatC] ?? '0')).toFixed(2),
    };
  }).filter(r => r.id || r.name);
};

// ─────────────────────────────────────────────────────────────
// RadarChart カスタム Tooltip
// ─────────────────────────────────────────────────────────────
const RadarTip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs font-bold text-slate-700">
      {payload[0].name}: <span className="text-indigo-600">{Number(payload[0].value).toFixed(2)}</span> / 5
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// モディファイア表示バッジ
// ─────────────────────────────────────────────────────────────
const ModBadge = ({ v, label }: { v: number; label: string }) => {
  if (Math.abs(v) < 0.01) return null;
  const pos = v > 0;
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${pos ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
      {label} {pos ? '+' : ''}{v.toFixed(2)}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────
interface HRIndividualManagerProps {
  employees: Employee[];
  results: TestResult[];
  trainings: Training[];
}

// ─────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────
export const HRIndividualManager: React.FC<HRIndividualManagerProps> = ({
  employees, results, trainings,
}) => {
  // ── 検索・絞り込み
  const [searchText,   setSearchText]   = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  // ── タブ
  const [innerTab, setInnerTab] = useState<'competency' | 'import' | 'sales' | 'incidents'>('competency');

  // ── 社員別データ（切替時にロード）
  const [rawScores,    setRawScores]    = useState<Record<string, number>>({ ...DEF_RAW });
  const [mgrScores,    setMgrScores]    = useState<Record<string, number>>({ ...DEF_MGR });
  const [swotMods,     setSwotMods]     = useState<Record<string, number>>({});
  const [salesMods,    setSalesMods]    = useState<Record<string, number>>({});
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [incidents,    setIncidents]    = useState<Incident[]>([]);
  const [lastEmpId,    setLastEmpId]    = useState<string | null>(null);

  // ── インポート
  const [importSubTab,  setImportSubTab]  = useState<'swot' | 'sales'>('swot');
  const [importMode,    setImportMode]    = useState<'single' | 'bulk'>('single');
  const [swotPreview,   setSwotPreview]   = useState<ParsedSWOT[] | null>(null);
  const [salesPreview,  setSalesPreview]  = useState<ParsedSales[] | null>(null);
  const [isImporting,   setIsImporting]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 事案フォーム
  const [newIncDate, setNewIncDate] = useState('');
  const [newIncDesc, setNewIncDesc] = useState('');
  const [showAddInc, setShowAddInc] = useState(false);

  // ─── 派生値
  const departments = useMemo(() =>
    [...new Set(employees.map(e => e.department).filter(Boolean))] as string[],
    [employees]
  );

  const filteredEmployees = useMemo(() =>
    employees.filter(e => {
      const nm = !searchText || e.name.toLowerCase().includes(searchText.toLowerCase());
      const dp = !selectedDept || e.department === selectedDept;
      return nm && dp;
    }),
    [employees, searchText, selectedDept]
  );

  const currentEmployee = filteredEmployees[currentIndex] ?? null;

  // ─── 社員切替時にデータをロード
  useEffect(() => {
    if (!currentEmployee || currentEmployee.id === lastEmpId) return;
    const id = currentEmployee.id;
    setRawScores(ls.load(`sb_comp_${id}`,      { ...DEF_RAW }));
    setMgrScores(ls.load(`sb_mgr_${id}`,       { ...DEF_MGR }));
    setSwotMods( ls.load(`sb_swot_${id}`,      {}));
    setSalesMods(ls.load(`sb_sales_mod_${id}`, {}));
    setSalesRecords(ls.load<SalesRecord[]>(`sb_sales_rec_${id}`, []));
    setIncidents(ls.load<Incident[]>(`sb_incidents_${id}`, []));
    setLastEmpId(id);
    setSwotPreview(null); setSalesPreview(null); setShowAddInc(false);
  }, [currentEmployee?.id]);

  useEffect(() => { setCurrentIndex(0); }, [searchText, selectedDept]);

  // ─── コンプライアンスモディファイア（自動計算）
  const complianceMods = useMemo(() => {
    if (!currentEmployee) return {};
    return computeComplianceMods(currentEmployee.id, results, trainings);
  }, [currentEmployee?.id, results, trainings]);

  // ─── 最終スコア計算
  const finalScores = useMemo(() =>
    computeFinalScores(rawScores, swotMods, salesMods, complianceMods, mgrScores),
    [rawScores, swotMods, salesMods, complianceMods, mgrScores]
  );

  // ─── レーダー用データ（最終スコアのカテゴリ平均）
  const radarData = COMPETENCY_GROUPS.map(g => ({
    category: g.label,
    value: +( g.items.reduce((s, item) => s + (finalScores[item.key] ?? 3), 0) / g.items.length ).toFixed(2),
    fullMark: 5,
  }));

  // ─── スコアハンドラ
  const handleRaw = (key: string, val: number) => {
    if (!currentEmployee) return;
    const next = { ...rawScores, [key]: val };
    setRawScores(next);
    ls.save(`sb_comp_${currentEmployee.id}`, next);
  };
  const handleMgr = (gKey: string, val: number) => {
    if (!currentEmployee) return;
    const next = { ...mgrScores, [gKey]: val };
    setMgrScores(next);
    ls.save(`sb_mgr_${currentEmployee.id}`, next);
  };

  // ─── ファイル選択 → プレビュー
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setSwotPreview(null); setSalesPreview(null);
    try {
      const rows = await parseFileToRows(file);
      if (importSubTab === 'swot') {
        setSwotPreview(parseSWOT(rows));
      } else {
        setSalesPreview(parseSalesFile(rows));
      }
    } catch {
      alert('ファイルの読み込みに失敗しました。形式を確認してください。');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  // ─── インポート適用（SWOT）
  const applySWOT = () => {
    if (!swotPreview) return;
    if (importMode === 'single' && currentEmployee) {
      const row = swotPreview.find(r =>
        String(r.id).trim().toUpperCase() === String(currentEmployee.id).trim().toUpperCase() ||
        r.name === currentEmployee.name
      ) ?? swotPreview[0];
      if (!row) return alert('一致する行が見つかりませんでした。');
      setSwotMods(row.mods);
      ls.save(`sb_swot_${currentEmployee.id}`, row.mods);
      alert(`${currentEmployee.name} のSWOTデータを反映しました。`);
    } else {
      let count = 0;
      swotPreview.forEach(row => {
        const emp = employees.find(e =>
          String(e.id).trim().toUpperCase() === String(row.id).trim().toUpperCase() || e.name === row.name
        );
        if (!emp) return;
        ls.save(`sb_swot_${emp.id}`, row.mods);
        if (currentEmployee?.id === emp.id) setSwotMods(row.mods);
        count++;
      });
      alert(`${count}名のSWOTデータを一括反映しました。`);
    }
    setSwotPreview(null);
  };

  // ─── インポート適用（売上）
  const applySales = () => {
    if (!salesPreview) return;
    const toRecords = (rows: ParsedSales[]): SalesRecord[] =>
      rows.map(r => ({ ...r, id: Date.now().toString() + Math.random(), importedAt: new Date().toISOString() }));

    const mergeSave = (empId: string, newRec: SalesRecord[]) => {
      const existing = ls.load<SalesRecord[]>(`sb_sales_rec_${empId}`, [])
        .filter(r => !newRec.some(nr => nr.period === r.period));
      const merged = [...existing, ...newRec].sort((a, b) => b.period.localeCompare(a.period));
      ls.save(`sb_sales_rec_${empId}`, merged);
      const mods = salesRecordsToMods(merged);
      ls.save(`sb_sales_mod_${empId}`, mods);
      return { merged, mods };
    };

    if (importMode === 'single' && currentEmployee) {
      const rows = salesPreview.filter(r =>
        String(r.id).trim().toUpperCase() === String(currentEmployee.id).trim().toUpperCase() ||
        r.name === currentEmployee.name
      );
      const targets = rows.length ? rows : salesPreview;
      const { merged, mods } = mergeSave(currentEmployee.id, toRecords(targets));
      setSalesRecords(merged); setSalesMods(mods);
      alert(`${currentEmployee.name} の売上データ${targets.length}件を反映しました。`);
    } else {
      const byEmp = new Map<string, ParsedSales[]>();
      salesPreview.forEach(r => {
        const emp = employees.find(e =>
          String(e.id).trim().toUpperCase() === String(r.id).trim().toUpperCase() || e.name === r.name
        );
        if (!emp) return;
        if (!byEmp.has(emp.id)) byEmp.set(emp.id, []);
        byEmp.get(emp.id)!.push(r);
      });
      byEmp.forEach((rows, empId) => {
        const { merged, mods } = mergeSave(empId, toRecords(rows));
        if (currentEmployee?.id === empId) { setSalesRecords(merged); setSalesMods(mods); }
      });
      alert(`${byEmp.size}名の売上データを一括反映しました。`);
    }
    setSalesPreview(null);
  };

  // ─── 事案
  const addIncident = () => {
    if (!currentEmployee || !newIncDate || !newIncDesc.trim()) return;
    const inc: Incident = { id: Date.now().toString(), date: newIncDate, description: newIncDesc.trim() };
    const updated = [...incidents, inc].sort((a, b) => b.date.localeCompare(a.date));
    setIncidents(updated); ls.save(`sb_incidents_${currentEmployee.id}`, updated);
    setNewIncDate(''); setNewIncDesc(''); setShowAddInc(false);
  };
  const deleteIncident = (id: string) => {
    if (!currentEmployee) return;
    const updated = incidents.filter(i => i.id !== id);
    setIncidents(updated); ls.save(`sb_incidents_${currentEmployee.id}`, updated);
  };

  // ─── 数値フォーマット
  const fmtN = (n: number) => n.toLocaleString('ja-JP');
  const fmtR = (n: number) => `${n.toFixed(1)}%`;

  // ─── 売上合計
  const salesTotals = useMemo(() => ({
    salesTarget:     salesRecords.reduce((s, r) => s + r.salesTarget, 0),
    salesActual:     salesRecords.reduce((s, r) => s + r.salesActual, 0),
    achievementRate: salesRecords.length
      ? +(salesRecords.reduce((s, r) => s + r.achievementRate, 0) / salesRecords.length).toFixed(1)
      : 0,
    profitAmount:    salesRecords.reduce((s, r) => s + r.profitAmount, 0),
    profitRate:      salesRecords.length
      ? +(salesRecords.reduce((s, r) => s + r.profitRate, 0) / salesRecords.length).toFixed(2)
      : 0,
  }), [salesRecords]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── 検索・ナビゲーションバー ── */}
      <div className="bg-white rounded-[2rem] border shadow-sm p-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">氏名で検索</label>
            <input type="text" placeholder="氏名を入力して絞り込み..."
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold focus:border-indigo-400 focus:outline-none"
              value={searchText} onChange={e => setSearchText(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[160px] space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">事業部で絞り込み</label>
            <select className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white focus:border-indigo-400 focus:outline-none"
              value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
              <option value="">すべての事業部</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
              className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 font-black text-xl hover:bg-indigo-100 hover:text-indigo-600 disabled:opacity-25 transition-all flex items-center justify-center">←</button>
            <div className="text-center min-w-[80px]">
              <p className="text-xs font-black text-slate-500">{filteredEmployees.length > 0 ? `${currentIndex + 1} / ${filteredEmployees.length}` : '0 / 0'}</p>
              <p className="text-[10px] text-slate-400 font-bold">名</p>
            </div>
            <button onClick={() => setCurrentIndex(i => Math.min(filteredEmployees.length - 1, i + 1))} disabled={currentIndex >= filteredEmployees.length - 1}
              className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 font-black text-xl hover:bg-indigo-100 hover:text-indigo-600 disabled:opacity-25 transition-all flex items-center justify-center">→</button>
          </div>
        </div>
      </div>

      {filteredEmployees.length === 0 && (
        <div className="bg-white rounded-[2rem] border shadow-sm p-16 text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-slate-400 font-bold">該当する社員が見つかりません</p>
        </div>
      )}

      {currentEmployee && (<>
        {/* ── 社員ヘッダーカード ── */}
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 rounded-[2rem] p-8 text-white shadow-xl shadow-indigo-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: '社員ID', value: currentEmployee.id },
              { label: '氏名',   value: currentEmployee.name },
              { label: '部門',   value: currentEmployee.department || '—' },
              { label: '役職',   value: currentEmployee.position   || '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest mb-1">{label}</p>
                <p className="text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 内部タブナビ ── */}
        <div className="flex bg-slate-100 p-1 rounded-2xl gap-0.5">
          {([
            { id: 'competency', label: 'コンピテンシー評価' },
            { id: 'import',     label: 'データ取込' },
            { id: 'sales',      label: '売上実績' },
            { id: 'incidents',  label: 'ペナルティ・事案' },
          ] as { id: typeof innerTab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setInnerTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${innerTab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════
            タブ1: コンピテンシー評価
        ═══════════════════════════════════════════════ */}
        {innerTab === 'competency' && (
          <div className="space-y-6">
            {/* スコア計算の説明バナー */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap gap-4 items-center text-xs font-bold text-indigo-700">
              <span className="bg-indigo-600 text-white px-3 py-1 rounded-lg">最終スコア</span>
              <span>= 自動評価（SWOT + 売上 + コンプライアンス）×</span>
              <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-black">70%</span>
              <span>+</span>
              <span>部長評価 ×</span>
              <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-black">30%</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* ── レーダーチャート ── */}
              <div className="bg-white rounded-[2rem] border shadow-sm p-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-slate-800">コンピテンシーレーダー</h3>
                  <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">最終スコア表示</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid gridType="polygon" stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                    <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} />
                    <Radar name={currentEmployee.name} dataKey="value"
                      stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2.5} />
                    <Tooltip content={<RadarTip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* ── スコア詳細（自動評価 + 部長評価） ── */}
              <div className="bg-white rounded-[2rem] border shadow-sm p-8 space-y-6 overflow-y-auto max-h-[520px]">
                <h3 className="text-lg font-black text-slate-800">スコア詳細</h3>

                {COMPETENCY_GROUPS.map(group => {
                  const mgrVal = mgrScores[group.key] ?? 3;
                  return (
                    <div key={group.key} className="space-y-3">
                      {/* カテゴリヘッダー */}
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: group.color }}>
                          {group.label}
                        </p>
                        <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">
                          部長評価 {mgrVal.toFixed(1)} / 5 （30%）
                        </span>
                      </div>

                      {/* 部長評価スライダー */}
                      <div className="flex items-center gap-3 px-2 py-2 bg-amber-50 rounded-xl border border-amber-100">
                        <span className="text-[10px] font-black text-amber-700 w-20 shrink-0">部長採点</span>
                        <input type="range" min={1} max={5} step={0.5} value={mgrVal}
                          onChange={e => handleMgr(group.key, parseFloat(e.target.value))}
                          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500" />
                        <span className="text-xs font-black text-amber-600 w-7 text-right">{mgrVal}</span>
                      </div>

                      {/* 15項目ごとの内訳 */}
                      {group.items.map(item => {
                        const raw   = rawScores[item.key] ?? 3;
                        const sM    = swotMods[item.key] ?? 0;
                        const slM   = salesMods[item.key] ?? 0;
                        const cM    = complianceMods[item.key] ?? 0;
                        const auto  = clamp(raw + sM + slM + cM);
                        const final = finalScores[item.key] ?? 3;
                        return (
                          <div key={item.key} className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-600 w-40 shrink-0">{item.label}</span>
                              <div className="flex gap-1 flex-wrap">
                                <ModBadge v={sM}  label="SWOT"   />
                                <ModBadge v={slM} label="売上"   />
                                <ModBadge v={cM}  label="研修"   />
                              </div>
                              <span className="ml-auto text-[10px] font-black text-slate-400">
                                自動: <span className="text-slate-600">{auto.toFixed(1)}</span>
                                {' → '}
                                最終: <span className="text-indigo-600 font-black">{final.toFixed(2)}</span>
                              </span>
                            </div>
                            {/* HRベースラインスライダー */}
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-bold text-slate-400 w-20 shrink-0">HRベース</span>
                              <input type="range" min={1} max={5} step={0.5} value={raw}
                                onChange={e => handleRaw(item.key, parseFloat(e.target.value))}
                                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                                style={{ accentColor: group.color }} />
                              <span className="text-xs font-black w-7 text-right" style={{ color: group.color }}>{raw}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            タブ2: データ取込
        ═══════════════════════════════════════════════ */}
        {innerTab === 'import' && (
          <div className="space-y-6">
            {/* サブタブ */}
            <div className="bg-white rounded-2xl border shadow-sm p-4 flex gap-2">
              {([
                { id: 'swot',  label: 'SWOTアナリシス取込' },
                { id: 'sales', label: '売上・利益実績取込' },
              ] as { id: typeof importSubTab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => { setImportSubTab(t.id); setSwotPreview(null); setSalesPreview(null); }}
                  className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${importSubTab === t.id ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-[2rem] border shadow-sm p-8 space-y-6">
              {/* 個別 / 一括切替 */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-black text-slate-700">取込モード</span>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
                  {([['single','個別取込（現在の社員）'],['bulk','一括取込（全社員マッチング）']] as [typeof importMode, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setImportMode(id)}
                      className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${importMode === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ファイル形式説明 */}
              <div className="p-4 bg-slate-50 rounded-2xl text-xs font-bold text-slate-600 space-y-2">
                <p className="font-black text-slate-700">
                  {importSubTab === 'swot' ? '📊 SWOTファイル形式' : '💹 売上ファイル形式'}
                </p>
                {importSubTab === 'swot' ? (
                  <div className="space-y-1">
                    <p>• <span className="text-indigo-600">直接コンピテンシー形式</span>: 社員ID, 氏名, 問題解決力, 批判的思考, 学習敏捷性, ... （各項目 1〜5）</p>
                    <p>• <span className="text-violet-600">SWOT生スコア形式</span>: 社員ID, 氏名, 強み(S), 弱み(W), 機会(O), 脅威(T) （各 1〜5）</p>
                    <p className="text-slate-400">※ ヘッダー行のカラム名から形式を自動判定します</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p>• 必要列: 社員ID, 氏名, 期間, 売上目標, 売上実績, 達成率, 利益額, 利益率</p>
                    <p>• 同一社員の複数期間を複数行で記載可能（一括取込時は社員IDで自動振分け）</p>
                    <p className="text-slate-400">※ 達成率は「95」「95%」どちらの形式でも可。省略時は目標/実績から自動計算</p>
                  </div>
                )}
              </div>

              {/* ファイルアップロード */}
              <div>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileSelect}
                  className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={isImporting}
                  className="w-full py-4 border-2 border-dashed border-indigo-300 rounded-2xl text-indigo-600 font-black text-sm hover:border-indigo-500 hover:bg-indigo-50 transition-all disabled:opacity-50">
                  {isImporting ? '読み込み中...' : '📁 Excel / CSV / TXT ファイルを選択'}
                </button>
              </div>

              {/* SWOTプレビュー */}
              {importSubTab === 'swot' && swotPreview && swotPreview.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-slate-700">{swotPreview.length}件のデータを読み込みました</p>
                    <button onClick={applySWOT}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
                      コンピテンシーに反映
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-black text-slate-500">ID</th>
                          <th className="px-4 py-3 text-left font-black text-slate-500">氏名</th>
                          <th className="px-4 py-3 text-left font-black text-slate-500">主なモディファイア</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {swotPreview.slice(0, 10).map((r, i) => (
                          <tr key={i} className={currentEmployee && (r.id === currentEmployee.id || r.name === currentEmployee.name) ? 'bg-indigo-50' : ''}>
                            <td className="px-4 py-3 font-mono text-slate-500">{r.id}</td>
                            <td className="px-4 py-3 font-bold text-slate-700">{r.name}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(r.mods)
                                  .filter(([, v]) => Math.abs(v) >= 0.1)
                                  .slice(0, 5)
                                  .map(([k, v]) => (
                                    <ModBadge key={k} v={v} label={k} />
                                  ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {swotPreview.length > 10 && (
                          <tr><td colSpan={3} className="px-4 py-3 text-center text-slate-400 font-bold">…他 {swotPreview.length - 10} 件</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 売上プレビュー */}
              {importSubTab === 'sales' && salesPreview && salesPreview.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-slate-700">{salesPreview.length}件のデータを読み込みました</p>
                    <button onClick={applySales}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all">
                      売上実績に反映
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          {['ID','氏名','期間','売上目標','売上実績','達成率','利益額','利益率'].map(h => (
                            <th key={h} className="px-4 py-3 text-left font-black text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {salesPreview.slice(0, 10).map((r, i) => (
                          <tr key={i} className={currentEmployee && (r.id === currentEmployee.id || r.name === currentEmployee.name) ? 'bg-emerald-50' : ''}>
                            <td className="px-4 py-3 font-mono text-slate-500">{r.id}</td>
                            <td className="px-4 py-3 font-bold">{r.name}</td>
                            <td className="px-4 py-3">{r.period}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtN(r.salesTarget)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtN(r.salesActual)}</td>
                            <td className={`px-4 py-3 text-right font-black tabular-nums ${r.achievementRate >= 100 ? 'text-emerald-600' : r.achievementRate >= 80 ? 'text-slate-700' : 'text-rose-600'}`}>
                              {fmtR(r.achievementRate)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtN(r.profitAmount)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtR(r.profitRate)}</td>
                          </tr>
                        ))}
                        {salesPreview.length > 10 && (
                          <tr><td colSpan={8} className="px-4 py-3 text-center text-slate-400 font-bold">…他 {salesPreview.length - 10} 件</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            タブ3: 売上実績
        ═══════════════════════════════════════════════ */}
        {innerTab === 'sales' && (
          <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b bg-slate-50/60 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">売上・利益 実績一覧</h3>
                <p className="text-xs text-slate-400 font-bold mt-0.5">通期データ（期間降順）</p>
              </div>
              {salesRecords.length > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase">平均達成率</p>
                  <p className={`text-2xl font-black ${salesTotals.achievementRate >= 100 ? 'text-emerald-600' : salesTotals.achievementRate >= 80 ? 'text-slate-800' : 'text-rose-600'}`}>
                    {fmtR(salesTotals.achievementRate)}
                  </p>
                </div>
              )}
            </div>

            {salesRecords.length === 0 ? (
              <div className="p-16 text-center">
                <p className="text-4xl mb-4">📈</p>
                <p className="text-slate-400 font-bold">売上データがありません</p>
                <p className="text-slate-300 font-bold text-xs mt-1">「データ取込」タブからインポートしてください</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[10px] uppercase font-black text-slate-400">
                    <tr>
                      <th className="px-6 py-4 text-left">期間</th>
                      <th className="px-6 py-4 text-right">売上目標</th>
                      <th className="px-6 py-4 text-right">売上実績</th>
                      <th className="px-6 py-4 text-right">達成率</th>
                      <th className="px-6 py-4 text-right">利益額</th>
                      <th className="px-6 py-4 text-right">利益率</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salesRecords.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-black text-slate-700">{r.period}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-500 tabular-nums">{fmtN(r.salesTarget)}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-800 tabular-nums">{fmtN(r.salesActual)}</td>
                        <td className={`px-6 py-4 text-right font-black tabular-nums ${r.achievementRate >= 100 ? 'text-emerald-600' : r.achievementRate >= 80 ? 'text-slate-800' : 'text-rose-600'}`}>
                          {fmtR(r.achievementRate)}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-800 tabular-nums">{fmtN(r.profitAmount)}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-600 tabular-nums">{fmtR(r.profitRate)}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => {
                            if (!currentEmployee) return;
                            const updated = salesRecords.filter(x => x.id !== r.id);
                            setSalesRecords(updated);
                            ls.save(`sb_sales_rec_${currentEmployee.id}`, updated);
                            const mods = salesRecordsToMods(updated);
                            setSalesMods(mods);
                            ls.save(`sb_sales_mod_${currentEmployee.id}`, mods);
                          }} className="text-rose-400 hover:text-rose-600 text-xs font-black transition-colors">削除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* 合計行 */}
                  <tfoot className="bg-indigo-50 border-t-2 border-indigo-100 text-sm font-black">
                    <tr>
                      <td className="px-6 py-4 text-indigo-700">合計 / 平均</td>
                      <td className="px-6 py-4 text-right text-indigo-600 tabular-nums">{fmtN(salesTotals.salesTarget)}</td>
                      <td className="px-6 py-4 text-right text-indigo-600 tabular-nums">{fmtN(salesTotals.salesActual)}</td>
                      <td className={`px-6 py-4 text-right tabular-nums ${salesTotals.achievementRate >= 100 ? 'text-emerald-700' : salesTotals.achievementRate >= 80 ? 'text-indigo-700' : 'text-rose-700'}`}>
                        {fmtR(salesTotals.achievementRate)}
                      </td>
                      <td className="px-6 py-4 text-right text-indigo-600 tabular-nums">{fmtN(salesTotals.profitAmount)}</td>
                      <td className="px-6 py-4 text-right text-indigo-600 tabular-nums">{fmtR(salesTotals.profitRate)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            タブ4: ペナルティ・事案
        ═══════════════════════════════════════════════ */}
        {innerTab === 'incidents' && (
          <div className="bg-white rounded-[2rem] border shadow-sm p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-black text-slate-800">過去のペナルティ・事案</h3>
                <p className="text-xs text-slate-400 font-bold mt-0.5">年月日順（降順）で表示</p>
              </div>
              <button onClick={() => setShowAddInc(v => !v)}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 transition-all shadow-lg shadow-rose-100">
                {showAddInc ? 'キャンセル' : '＋ 追加'}
              </button>
            </div>

            {showAddInc && (
              <div className="mb-6 p-5 bg-rose-50 border-2 border-rose-200 rounded-2xl space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest">年月日</label>
                  <input type="date"
                    className="w-full px-4 py-2 rounded-xl border-2 border-rose-200 text-sm font-bold focus:outline-none focus:border-rose-400 bg-white"
                    value={newIncDate} onChange={e => setNewIncDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest">事案の詳細</label>
                  <textarea rows={3} placeholder="ペナルティや事案の詳細を入力..."
                    className="w-full px-4 py-2 rounded-xl border-2 border-rose-200 text-sm font-bold focus:outline-none focus:border-rose-400 resize-none bg-white"
                    value={newIncDesc} onChange={e => setNewIncDesc(e.target.value)} />
                </div>
                <button onClick={addIncident} disabled={!newIncDate || !newIncDesc.trim()}
                  className="w-full py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 disabled:opacity-40 transition-all">
                  記録を保存
                </button>
              </div>
            )}

            {incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-slate-400 font-bold text-sm">記録された事案はありません</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {incidents.map(inc => (
                  <li key={inc.id} className="flex gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-rose-100 transition-colors">
                    <div className="w-1.5 rounded-full bg-rose-400 shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-1">{inc.date}</p>
                      <p className="text-sm font-bold text-slate-700 leading-relaxed break-words">{inc.description}</p>
                    </div>
                    <button onClick={() => deleteIncident(inc.id)}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-rose-100 text-rose-500 text-xs font-black flex items-center justify-center hover:bg-rose-200 transition-all shrink-0 self-start">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </>)}
    </div>
  );
};
