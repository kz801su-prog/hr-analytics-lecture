
export enum Role {
  TRAINER = 'TRAINER',
  TRAINEE = 'TRAINEE',
  HR = 'HR'
}

export interface Employee {
  id: string;
  name: string;
  role: Role;
  password?: string;
  otpSecret?: string;
  lastActive?: string;
  department?: string;
  position?: string;
  requiredTrainings?: string[]; // Training IDs that are required
  challengeTrainings?: string[]; // Training IDs that are optional
  // ── 拡張個人データ ──────────────────────────────
  employeeNo?: string;       // 社員番号（別途管理番号）
  hireDate?: string;         // 入社日 (YYYY-MM-DD)
  email?: string;            // メールアドレス
  phone?: string;            // 電話番号
  managerId?: string;        // 上司の社員ID
  grade?: string;            // 等級 (例: G1, G2, M1 …)
  employmentType?: string;   // 雇用形態 (正社員 / 契約社員 / 派遣 …)
}

// ── 役職別アクセス権限 ──────────────────────────────────────
export type EmployeeFieldKey =
  | 'id' | 'name' | 'department' | 'position' | 'role'
  | 'employeeNo' | 'hireDate' | 'email' | 'phone'
  | 'managerId' | 'grade' | 'employmentType'
  | 'results' | 'competency' | 'psychAnalysis' | 'salesData' | 'incidents';

export interface PositionPermission {
  position: string;          // 役職名 (例: "部長", "課長", "一般")
  viewableFields: EmployeeFieldKey[];  // 閲覧できるフィールド
  canViewAllDept: boolean;   // 同部署全員のデータを見られるか
  canViewSubordinates: boolean; // 部下のデータを見られるか
  canViewOwnOnly: boolean;   // 自分のデータのみ
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  createdBy: string;
  priority: 'high' | 'normal' | 'low';
  active: boolean;
}

export interface TrainingMaterial {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface TestPattern {
  id: string;
  name: string;
  questions: Question[];
  createdAt: string;
}

export interface Training {
  id: string;
  title: string;
  date: string;
  description: string;
  patterns: TestPattern[];
  activePatternId: string;
  materials?: TrainingMaterial[];
  targetEmployees?: string[]; // Employee IDs
  targetDepartments?: string[]; // Department names
  targetPositions?: string[]; // Position names
  isRequiredForAll?: boolean; // 全員必須フラグ
  studyLinks?: { label: string; url: string }[]; // 勉強資料リンク（最大5つ）
  fiscalYear?: number; // 年度 (e.g., 2025, 2026)
}

export interface TestResult {
  trainingId: string;
  trainingTitle?: string;
  patternId?: string;
  employeeName: string;
  employeeId: string;
  preScore: number;
  postScore: number;
  userAnswers?: number[];
  completedAt: string;
  analysis: string;
  advice?: string;
  deviation?: number;
  traits?: string[];
  competencies?: string[];
  totalQuestions?: number;
  postAnswerTimeSec?: number; // 事後テストの回答所要時間（秒）
}

export interface DeepAnalysisRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  content: string;
  instructionUsed?: string;
  fiscalYear?: number; // 年度 (e.g., 48, 49)
  psychMods?: Record<string, number>; // 深層心理→コンピテンシーモディファイア
}

export interface PsychApplication {
  employeeId: string;
  employeeName: string;
  appliedAt: string;
}

export interface AuthSession {
  name: string;
  employeeId: string;
  role: Role;
}

export interface WrongAnswerAnalysis {
  id: string;
  trainingId: string;
  trainingTitle: string;
  questionIndex: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  wrongCount: number;
  wrongEmployees: {
    employeeId: string;
    employeeName: string;
    selectedAnswer: number;
  }[];
  totalAttempts: number;
  wrongRate: number;
  analyzedAt: string;
}
